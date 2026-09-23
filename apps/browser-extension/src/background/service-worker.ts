import { type Message } from '../types';
import { consoleFileUrl } from '../console';
import { type ChromeBookmarkNode, flattenChromeBookmarks } from './chrome-bookmarks';
import {
  buildRawNote,
  KB_ASSET_DIR,
  KB_RAW_DIR,
  localizeImages,
  selectionText,
  slugify,
  urlToSlug,
} from './kb-capture';
import {
  addBookmark,
  applyUsage,
  BOOKMARKS_PATH,
  type Bookmark,
  type BookmarkDraft,
  type BookmarksCache,
  type BookmarkUsage,
  countUse,
  EMPTY_USAGE,
  hasUsageToPush,
  isCacheStale,
  isCacheUsable,
  parseBookmarks,
  serializeBookmarks,
  setBookmarkPinned,
  settleUsage,
} from './bookmarks';
import {
  findGroup,
  isOpenableUrl,
  isPinnedTabsCacheStale,
  isPinnedTabsCacheUsable,
  matchGroup,
  moveGroup,
  normalizeGroupName,
  PINNED_TABS_PATH,
  type PinnedTabGroup,
  type PinnedTabsCache,
  type PinnedTabsConfig,
  parsePinnedTabs,
  putGroup,
  removeGroup,
  serializePinnedTabs,
  tabsToOpen,
  tabsToUnpin,
  toPinnedTabs,
} from './pinned-tabs';

console.log('LifeOS Extension: Background script loaded');

// Keep the service worker alive to prevent the HMR port (crx-client-port.js)
// from disconnecting. Chrome suspends MV3 service workers after ~30s of
// inactivity; the alarm wakes it up periodically so the Vite HMR connection
// stays intact during development.
chrome.alarms.create('swKeepAlive', { periodInMinutes: 0.5 });

// Bookmarks and pinned-tab groups are served from their caches and refreshed behind the user's
// back, so the palette and the popup open instantly. Once an hour is the whole budget the extension
// spends on GitHub by itself; opening the popup checks too, and what happens in between — which
// bookmarks get opened — is counted locally and pushed with the next sync.
chrome.alarms.create('repoSync', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'swKeepAlive') {
    // No-op: waking the worker is sufficient.
  }
  if (alarm.name === 'repoSync') {
    syncBookmarks().catch((e) => console.warn('LifeOS Extension: bookmark sync failed', e));
    syncPinnedTabs().catch((e) => console.warn('LifeOS Extension: pinned tab sync failed', e));
  }
});

// An open port keeps the MV3 service worker from being collected. The popup holds one for
// as long as it is open, so a request fired after the user has spent a while typing (renaming
// a tab group, say) still finds the worker alive instead of racing its teardown — which
// surfaced as "The message port closed before a response was received".
chrome.runtime.onConnect.addListener(() => {
  // Accepting the port is the whole job — holding it open is what keeps the worker alive.
});

// Whatever the bundler named the content script, so injecting it needs no hard-coded hash.
function contentScriptFiles(): string[] {
  return (chrome.runtime.getManifest().content_scripts ?? []).flatMap((script) => script.js ?? []);
}

/** Whether the tab is showing a page of this extension's own — the start page, in practice. */
async function isExtensionPage(tabId: number): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  return tab?.url?.startsWith(chrome.runtime.getURL('')) ?? false;
}

const TOGGLE_RETRIES = 10;
const TOGGLE_RETRY_MS = 50;

const togglePalette = (tabId: number) =>
  chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_COMMAND_PALETTE' });

/**
 * Relays the shortcut to the tab, injecting the content script first if it is not there.
 *
 * Declared content scripts only run when a page loads, so every tab that was already open when
 * the extension was installed, reloaded or updated has none until it is reloaded — pressing the
 * shortcut in one of those used to do nothing at all. Injecting on demand covers that without
 * asking the user to reload anything.
 */
async function openPaletteInTab(tabId: number): Promise<boolean> {
  try {
    await togglePalette(tabId);
    return true;
  } catch {
    // Nothing listening yet — fall through and inject.
  }

  // The start page is one of ours, and nothing may be injected into an extension page. It answers
  // a broadcast instead, which every open start page hears and only the visible one acts on.
  if (await isExtensionPage(tabId)) {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_COMMAND_PALETTE' }).catch(() => {});
    return true;
  }

  const files = contentScriptFiles();
  if (files.length === 0) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  } catch {
    // A page no extension may touch: chrome://, the Web Store, the PDF viewer, view-source.
    return false;
  }

  // The injected loader pulls the content script in as a module, so its message listener is only
  // in place a tick or two later.
  for (let attempt = 0; attempt < TOGGLE_RETRIES; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, TOGGLE_RETRY_MS));
    try {
      await togglePalette(tabId);
      return true;
    } catch {
      // Still coming up.
    }
  }
  return false;
}

async function readUsage(repo: string): Promise<BookmarkUsage> {
  const stored = await chrome.storage.local.get('bookmarkUsage');
  const usage = stored.bookmarkUsage as BookmarkUsage | undefined;
  // Counts belong to one repo's file; another repo's are meaningless here.
  return usage && usage.repo === repo && usage.deltas ? usage : EMPTY_USAGE(repo);
}

/**
 * Counts one open, locally. Nothing is sent now: the delta rides along with the next sync or the
 * next commit, which is what keeps opening bookmarks off the GitHub API entirely.
 */
async function recordBookmarkUse(id: string) {
  const { repo } = await credentials();
  if (!id) return { counted: false };
  const usage = countUse(await readUsage(repo), id);
  await chrome.storage.local.set({ bookmarkUsage: usage });
  return { counted: true, pending: usage.deltas[id]?.count ?? 0 };
}

/**
 * The hourly check, run when the alarm fires and when the popup opens. A cache still inside its
 * hour is left alone — including its pending counts, which wait for the next one.
 *
 * `force` is what "Sync now" passes: asking for it outright is not background traffic, so the
 * budget does not apply. Pinned-tab groups come along, since the point of asking is to be up to
 * date with the repo rather than with one file of it.
 */
async function syncIfStale(force = false) {
  const { token, repo } = await credentials();
  if (!token) return { synced: false, reason: 'no token' };

  const cache = await readBookmarksCache();
  if (!force && isCacheUsable(cache, repo) && cache && !isCacheStale(cache)) {
    return { synced: false, reason: 'fresh' };
  }

  const synced = await syncBookmarks();
  if (force) {
    // Best effort: a hand-broken pinnedtabs file should not take "Sync now" down with it.
    await syncPinnedTabs().catch((e) =>
      console.warn('LifeOS Extension: pinned tab sync failed', e),
    );
  }
  return { synced: true, bookmarks: synced?.bookmarks.length ?? 0 };
}

/** How many of the palette's last actions are kept. */
const RECENTS_LIMIT = 10;

export interface RecentEntry {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
}

async function readRecents(): Promise<RecentEntry[]> {
  const stored = await chrome.storage.local.get('recentActions');
  const recents = stored.recentActions as RecentEntry[] | undefined;
  return Array.isArray(recents) ? recents : [];
}

/** Newest first, one entry per id, capped — so repeating something moves it back to the top. */
async function rememberRecent(entry: RecentEntry): Promise<RecentEntry[]> {
  if (!entry?.id || !entry.title) return readRecents();
  const rest = (await readRecents()).filter((candidate) => candidate.id !== entry.id);
  const recents = [entry, ...rest].slice(0, RECENTS_LIMIT);
  await chrome.storage.local.set({ recentActions: recents });
  return recents;
}

/** The popup icon is the only surface a content script cannot reach, so failure shows up there. */
async function flagPaletteFailure(tabId: number) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' });
  await chrome.action.setBadgeText({ tabId, text: '!' });
}

// The keyboard shortcut is an extension-level command, which only the worker can hear; the palette
// itself lives in the page, so the command is relayed to the active tab.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-command-palette') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;

  await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  if (await openPaletteInTab(tab.id)) return;

  console.warn(`LifeOS Extension: the palette cannot run on this page (${tab.url ?? 'unknown'})`);
  await flagPaletteFailure(tab.id);
});

// Initialize Context Menu
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'lifosy-save-knowledge',
    title: 'Add to Knowledge Base',
    contexts: ['selection'],
  });

  // Chrome drops a `suggested_key` it cannot honour — because the OS, another extension or Chrome
  // itself already owns the combination — and leaves the command unbound without saying so. Say so
  // here, since "the shortcut does nothing" looks identical to a broken extension.
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === 'toggle-command-palette')?.shortcut;
  if (shortcut) {
    console.log(`LifeOS Extension: command palette bound to ${shortcut}`);
  } else {
    console.warn(
      'LifeOS Extension: no shortcut is bound to the command palette — assign one at chrome://extensions/shortcuts',
    );
  }
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lifosy-save-knowledge' && info.selectionText) {
    saveToKnowledgeBase(info.selectionText, tab?.url || '', tab?.title || '').catch((e) =>
      console.error('LifeOS Extension: Error saving clipping', e),
    );
  }
});

// Add comprehensive GitHub API helper
async function githubUpsertFile(token: string, repoUrl: string, filePath: string, newContentLines: string, position: 'top' | 'bottom' = 'bottom') {
  const url = `https://api.github.com/repos/${repoUrl}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  let fileSha = '';
  let currentContent = '';

  try {
    const getRes = await fetch(url, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      fileSha = data.sha;
      // Decode base64
      currentContent = decodeURIComponent(escape(atob(data.content || '')));
    } else if (getRes.status === 404) {
      // File doesn't exist yet, we'll create it
      currentContent = '';
    } else {
      throw new Error(`Failed to get file: ${getRes.statusText}`);
    }

    const updatedContent = currentContent
      ? (position === 'top' ? `${newContentLines}\n\n${currentContent}` : `${currentContent}\n\n${newContentLines}`)
      : newContentLines;

    // Encode base64
    const newBase64 = btoa(unescape(encodeURIComponent(updatedContent)));

    const putRes = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Append to ${filePath} via Extension`,
        content: newBase64,
        sha: fileSha || undefined,
      }),
    });

    if (!putRes.ok) {
      throw new Error(`Failed to update file: ${putRes.statusText}`);
    }
  } catch (error) {
    console.error('githubAppendToFile Error:', error);
    throw error;
  }
}

// GitHub stores file content as base64; `atob`/`btoa` only speak latin-1, so round-trip
// through UTF-8 bytes to keep non-ASCII tab titles intact.
function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Unlike githubUpsertFile this replaces the file wholesale, which is what a
// snapshot-style JSON document needs.
async function githubReadFile(
  token: string,
  repoUrl: string,
  filePath: string,
): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to read ${filePath}: ${res.statusText}`);
  const data = await res.json();
  return { content: decodeBase64(data.content || ''), sha: data.sha };
}

async function githubWriteFile(
  token: string,
  repoUrl: string,
  filePath: string,
  content: string,
  sha?: string,
): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    body: JSON.stringify({
      message: `Update ${filePath} via Extension`,
      content: encodeBase64(content),
      sha,
    }),
  });
  if (!res.ok) throw new Error(`Failed to write ${filePath}: ${res.statusText}`);
  // The commit response carries the new blob sha, so the cache can be refreshed without a re-read.
  const written = await res.json().catch(() => null);
  return written?.content?.sha ?? null;
}

/** Creates a file from already-encoded bytes, e.g. an image downloaded for the knowledge base. */
async function githubPutBase64(token: string, repoUrl: string, filePath: string, base64: string) {
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    body: JSON.stringify({ message: `Add ${filePath} via Extension`, content: base64 }),
  });
  if (!res.ok) throw new Error(`Failed to write ${filePath}: ${res.statusText}`);
}

const EMPTY_CONFIG: PinnedTabsConfig = { groups: [], updatedAt: '' };

// Which group each window is running. Session storage is wiped when Chrome restarts,
// exactly like the window ids it is keyed by, so a stale entry can never point at the
// wrong group; after a restart we fall back to matching the window's pinned tabs.
async function readActiveGroups(): Promise<Record<string, string>> {
  const stored = await chrome.storage.session.get('activeGroups');
  return (stored.activeGroups as Record<string, string> | undefined) ?? {};
}

async function rememberActiveGroup(windowId: number, groupId: string) {
  const activeGroups = await readActiveGroups();
  await chrome.storage.session.set({ activeGroups: { ...activeGroups, [windowId]: groupId } });
}

async function recallActiveGroup(windowId: number): Promise<string | undefined> {
  return (await readActiveGroups())[windowId];
}

async function readPinnedTabsCache(): Promise<PinnedTabsCache | undefined> {
  const stored = await chrome.storage.local.get('pinnedTabsCache');
  return stored.pinnedTabsCache as PinnedTabsCache | undefined;
}

/** Pulls the groups file into the cache, replaying GitHub's `ETag` so an unchanged file is a 304. */
async function syncPinnedTabs(): Promise<PinnedTabsCache | undefined> {
  const { token, repo } = await credentials();
  if (!token) return undefined;

  const cache = await readPinnedTabsCache();
  const known = isPinnedTabsCacheUsable(cache, repo) ? cache : undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
  if (known?.etag) headers['If-None-Match'] = known.etag;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${PINNED_TABS_PATH}`, {
    headers,
  });

  if (res.status === 304 && known) {
    const refreshed = { ...known, fetchedAt: Date.now() };
    await chrome.storage.local.set({ pinnedTabsCache: refreshed });
    return refreshed;
  }
  if (res.status === 404) {
    const empty: PinnedTabsCache = {
      repo,
      config: EMPTY_CONFIG,
      sha: null,
      etag: null,
      fetchedAt: Date.now(),
    };
    await chrome.storage.local.set({ pinnedTabsCache: empty });
    return empty;
  }
  if (!res.ok) throw new Error(`Failed to read ${PINNED_TABS_PATH}: ${res.statusText}`);

  const data = await res.json();
  const next: PinnedTabsCache = {
    repo,
    config: parsePinnedTabs(decodeBase64(data.content || '')),
    sha: data.sha ?? null,
    etag: res.headers?.get('etag') ?? null,
    fetchedAt: Date.now(),
  };
  await chrome.storage.local.set({ pinnedTabsCache: next });
  return next;
}

/**
 * Reads the groups file.
 *
 * `fresh` is what every write passes: committing against a `sha` the cache happened to be holding
 * would overwrite an edit made elsewhere since. Listing and loading take the cached copy, and a
 * stale one is refreshed in the background rather than waited on.
 */
async function readConfig(token: string, repo: string, fresh = false) {
  if (!fresh) {
    const cache = await readPinnedTabsCache();
    if (isPinnedTabsCacheUsable(cache, repo) && cache) {
      if (isPinnedTabsCacheStale(cache)) {
        syncPinnedTabs().catch((e) =>
          console.warn('LifeOS Extension: pinned tab refresh failed', e),
        );
      }
      return { config: cache.config, sha: cache.sha ?? undefined };
    }
    const synced = await syncPinnedTabs();
    if (synced) return { config: synced.config, sha: synced.sha ?? undefined };
  }

  const file = await githubReadFile(token, repo, PINNED_TABS_PATH);
  return { config: file ? parsePinnedTabs(file.content) : EMPTY_CONFIG, sha: file?.sha };
}

async function writeConfig(token: string, repo: string, config: PinnedTabsConfig, sha?: string) {
  const newSha = await githubWriteFile(
    token,
    repo,
    PINNED_TABS_PATH,
    serializePinnedTabs(config),
    sha,
  );
  // Keep the cache in step with what was just committed; the write invalidates the old ETag.
  await chrome.storage.local.set({
    pinnedTabsCache: { repo, config, sha: newSha, etag: null, fetchedAt: Date.now() },
  });
}

async function readBookmarksCache(): Promise<BookmarksCache | undefined> {
  const stored = await chrome.storage.local.get('bookmarksCache');
  return stored.bookmarksCache as BookmarksCache | undefined;
}

async function credentials(): Promise<{ token?: string; repo: string }> {
  const data = await chrome.storage.local.get(['lifeos_token', 'lifeos_repo']);
  return {
    token: data.lifeos_token as string | undefined,
    repo: (data.lifeos_repo as string) || 'lifosy/monorepo',
  };
}

/**
 * Brings the cache in line with GitHub, then pushes back anything counted since the last sync.
 *
 * GitHub leads: its list replaces the cache wholesale, so an edit or a delete made in the console
 * wins. Use counts are the exception — they are added to what GitHub holds rather than replacing
 * it, so two machines counting at once sum instead of clobbering each other. The push only happens
 * when there is something to push, so an hour in which nothing was opened costs one conditional GET
 * and no commit.
 *
 * GitHub's own `ETag` is replayed as `If-None-Match`, so an unchanged file answers 304 — which
 * GitHub does not bill against the rate limit.
 */
async function syncBookmarks(): Promise<BookmarksCache | undefined> {
  const { token, repo } = await credentials();
  if (!token) return undefined;

  const cache = await readBookmarksCache();
  const known = isCacheUsable(cache, repo) ? cache : undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
  if (known?.etag) headers['If-None-Match'] = known.etag;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${BOOKMARKS_PATH}`, {
    headers,
  });

  let next: BookmarksCache;
  // 304: the file is byte-identical to what the cache holds, so that is already GitHub's state.
  if (res.status === 304 && known) {
    next = { ...known, fetchedAt: Date.now() };
  } else if (res.status === 404) {
    // A repo without the file yet is a valid empty list, not an error.
    next = { repo, bookmarks: [], sha: null, etag: null, fetchedAt: Date.now() };
  } else if (!res.ok) {
    throw new Error(`Failed to read ${BOOKMARKS_PATH}: ${res.statusText}`);
  } else {
    const data = await res.json();
    next = {
      repo,
      bookmarks: parseBookmarks(decodeBase64(data.content || '')).bookmarks,
      sha: data.sha ?? null,
      etag: res.headers?.get('etag') ?? null,
      fetchedAt: Date.now(),
    };
  }

  await chrome.storage.local.set({ bookmarksCache: next });
  return pushUsage(token, repo, next);
}

/**
 * Commits the counted opens on top of the state just fetched, and leaves the cache holding what
 * GitHub now has. The pushed deltas are subtracted rather than cleared, so an open that happened
 * while the request was in flight survives for the next sync.
 */
async function pushUsage(
  token: string,
  repo: string,
  fetched: BookmarksCache,
): Promise<BookmarksCache> {
  const usage = await readUsage(repo);
  if (!hasUsageToPush(fetched.bookmarks, usage)) return fetched;

  const bookmarks = applyUsage(fetched.bookmarks, usage);
  const newSha = await githubWriteFile(
    token,
    repo,
    BOOKMARKS_PATH,
    serializeBookmarks({ bookmarks, updatedAt: new Date().toISOString() }),
    // The sha comes from the same GET that produced `fetched`, so it is the one to commit against.
    fetched.sha ?? undefined,
  );

  const pushed: BookmarksCache = {
    repo,
    bookmarks,
    sha: newSha,
    // The commit invalidates whatever ETag we were holding.
    etag: null,
    fetchedAt: Date.now(),
  };
  await chrome.storage.local.set({
    bookmarksCache: pushed,
    // Re-read rather than reusing `usage`: an open may have been counted mid-request.
    bookmarkUsage: settleUsage(await readUsage(repo), usage),
  });
  return pushed;
}

/**
 * Cache first: a usable cache answers immediately and a stale one is refreshed in the background,
 * so opening the palette never waits on GitHub. Only a missing or foreign-repo cache blocks.
 */
async function getBookmarks(): Promise<{
  bookmarks: Bookmark[];
  fetchedAt: number;
  stale: boolean;
}> {
  const { repo } = await credentials();
  const cache = await readBookmarksCache();

  if (isCacheUsable(cache, repo) && cache) {
    const stale = isCacheStale(cache);
    if (stale) {
      // Deliberately not awaited: the caller gets the cached list now.
      syncBookmarks().catch((e) => console.warn('LifeOS Extension: bookmark refresh failed', e));
    }
    return {
      bookmarks: applyUsage(cache.bookmarks, await readUsage(repo)),
      fetchedAt: cache.fetchedAt,
      stale,
    };
  }

  const fetched = await syncBookmarks();
  // No cache to fall back on, so being signed out is worth saying out loud.
  if (!fetched) throw new Error('No token found — log in through the console');
  return {
    bookmarks: applyUsage(fetched.bookmarks, await readUsage(repo)),
    fetchedAt: fetched.fetchedAt,
    stale: false,
  };
}

/**
 * Writes the page into the repo file and puts the result straight into the cache, so the palette
 * and the popup show it without waiting for the next sync.
 */
/**
 * Commits a change to the bookmarks file and puts the result straight into the cache, so the
 * palette and the popup show it without waiting for the next sync. The file is always re-read
 * first: committing against a sha the cache happened to be holding would overwrite an edit made
 * elsewhere since.
 */
async function commitBookmarks(
  change: (config: { bookmarks: Bookmark[]; updatedAt: string }) => {
    bookmarks: Bookmark[];
    updatedAt: string;
  },
) {
  const { token, repo } = await credentials();
  if (!token) throw new Error('No token found');

  const file = await githubReadFile(token, repo, BOOKMARKS_PATH);
  const config = file ? parseBookmarks(file.content) : { bookmarks: [], updatedAt: '' };
  const changed = change(config);

  // This commit is going out anyway, so the counted opens ride along for free.
  const usage = await readUsage(repo);
  const next = { ...changed, bookmarks: applyUsage(changed.bookmarks, usage) };
  const sha = await githubWriteFile(
    token,
    repo,
    BOOKMARKS_PATH,
    serializeBookmarks(next),
    file?.sha,
  );

  await chrome.storage.local.set({
    // The write invalidates whatever ETag we held, so the next sync does a full read.
    bookmarksCache: { repo, bookmarks: next.bookmarks, sha, etag: null, fetchedAt: Date.now() },
    bookmarkUsage: settleUsage(await readUsage(repo), usage),
  });
  return next;
}

/** Pinning is the user's own edit, so it commits straight away rather than waiting for the hour. */
async function pinBookmark(id: string, pinned: boolean) {
  const next = await commitBookmarks((config) => setBookmarkPinned(config, id, pinned));
  // commitBookmarks has already folded the counted opens in, so this is what the page should show.
  return { bookmarks: next.bookmarks };
}

async function bookmarkPage(draft: BookmarkDraft) {
  const next = await commitBookmarks((config) => addBookmark(config, draft));
  return { title: next.bookmarks[0]?.title ?? draft.url };
}

/**
 * Copies the browser's own bookmarks into the repo file in one commit. Pages already in the file
 * are skipped rather than duplicated, so running it twice is safe, and the imported entries are
 * appended so whatever the file already had stays where it was.
 */
async function importChromeBookmarks() {
  // The permission is optional and granted from the popup, which is the only surface that can ask:
  // `chrome.permissions.request` needs a user gesture in an extension page, which a message from
  // the palette is not.
  if (!(await chrome.permissions.contains({ permissions: ['bookmarks'] }))) {
    throw new Error('Allow access to your browser bookmarks from the popup first');
  }
  const tree = (await chrome.bookmarks.getTree()) as ChromeBookmarkNode[];
  const drafts = flattenChromeBookmarks(tree);

  let imported = 0;
  let skipped = 0;
  await commitBookmarks((config) => {
    let next = config;
    for (const draft of drafts) {
      try {
        // addBookmark prepends; the import reads better appended, so the existing list is kept
        // on top and the imported block follows it in the browser's own order.
        const added = addBookmark(next, draft);
        const [fresh, ...rest] = added.bookmarks;
        next = fresh ? { bookmarks: [...rest, fresh], updatedAt: added.updatedAt } : added;
        imported++;
      } catch {
        // Already bookmarked, or a url the browser must not navigate to.
        skipped++;
      }
    }
    return next;
  });
  return { imported, skipped, total: drafts.length };
}

/**
 * One GitHub code-search request, run only when the user explicitly asks for it. That endpoint has
 * its own ~10 req/min budget with a burst penalty, so the palette never calls this while typing.
 */
async function searchRepo(query: string) {
  const { token, repo } = await credentials();
  const trimmed = query.trim();
  if (!trimmed) return { results: [] };

  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const q = encodeURIComponent(`${trimmed} repo:${repo}`);
  const res = await fetch(`https://api.github.com/search/code?q=${q}&per_page=10`, { headers });
  if (res.status === 403) throw new Error('GitHub search is rate limited — try again in a minute');
  if (!res.ok) throw new Error(`GitHub search failed: ${res.statusText}`);

  const data = await res.json();
  // Opening the file in the console beats opening it on GitHub: it is where the file is
  // actually worked on, and its widgets know the file's type.
  const results = (data.items || []).map((item: any) => ({
    path: item.path as string,
    name: item.name as string,
    url: consoleFileUrl(item.path as string, repo),
  }));
  return { results };
}

/** The window the popup belongs to, plus its pinned tabs in one round-trip. */
async function currentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const pinned = tabs.filter((tab) => tab.pinned);
  return { windowId: tabs[0]?.windowId, pinned };
}

async function activeGroupId(
  groups: PinnedTabGroup[],
  windowId: number | undefined,
  pinnedUrls: string[],
): Promise<string | null> {
  const remembered = windowId === undefined ? undefined : await recallActiveGroup(windowId);
  if (remembered && groups.some((group) => group.id === remembered)) return remembered;
  return matchGroup(groups, pinnedUrls);
}

async function listPinnedTabGroups(token: string, repo: string) {
  const { config } = await readConfig(token, repo);
  const { windowId, pinned } = await currentWindow();
  const activeId = await activeGroupId(
    config.groups,
    windowId,
    pinned.map((tab) => tab.url || ''),
  );
  return {
    groups: config.groups.map((group) => ({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      tabCount: group.tabs.length,
    })),
    activeId,
  };
}

/** Makes the window's pinned set match the group: unpin what is not in it, open what is missing. */
async function loadPinnedTabGroup(token: string, repo: string, groupId: string) {
  const { config } = await readConfig(token, repo);
  const group = findGroup(config, groupId);
  const { windowId, pinned } = await currentWindow();

  const stale = tabsToUnpin(pinned, group.tabs);
  for (const tab of stale) {
    if (tab.id !== undefined) await chrome.tabs.update(tab.id, { pinned: false });
  }
  const missing = tabsToOpen(
    group.tabs,
    pinned.filter((tab) => !stale.includes(tab)).map((tab) => tab.url || ''),
  );
  for (const tab of missing) {
    await chrome.tabs.create({ url: tab.url, pinned: true, active: false });
  }

  if (windowId !== undefined) await rememberActiveGroup(windowId, group.id);
  return { opened: missing.length, unpinned: stale.length, name: group.name };
}

/**
 * Writes the window's pinned tabs into `groupId`, or into a new group called `name`.
 * Updating keeps the group's id, name and createdAt so history is not rewritten.
 */
async function savePinnedTabGroup(
  token: string,
  repo: string,
  groupId: string | undefined,
  name: string | undefined,
) {
  const { config, sha } = await readConfig(token, repo, true);
  const { windowId, pinned } = await currentWindow();
  const tabs = toPinnedTabs(pinned);
  const now = new Date().toISOString();

  let group: PinnedTabGroup;
  if (groupId) {
    group = { ...findGroup(config, groupId), tabs };
  } else {
    group = { id: crypto.randomUUID(), name: normalizeGroupName(name), createdAt: now, tabs };
  }

  await writeConfig(token, repo, putGroup(config, group, now), sha);
  if (windowId !== undefined) await rememberActiveGroup(windowId, group.id);
  return { count: tabs.length, name: group.name };
}

async function renamePinnedTabGroup(token: string, repo: string, groupId: string, name: string) {
  const { config, sha } = await readConfig(token, repo, true);
  const group = { ...findGroup(config, groupId), name: normalizeGroupName(name) };
  await writeConfig(token, repo, putGroup(config, group, new Date().toISOString()), sha);
  return { name: group.name };
}

async function movePinnedTabGroup(token: string, repo: string, groupId: string, offset: number) {
  const { config, sha } = await readConfig(token, repo, true);
  const next = moveGroup(config, groupId, offset, new Date().toISOString());
  // moveGroup hands back the same object at the ends of the list; skip the pointless commit.
  if (next === config) return { moved: false };
  await writeConfig(token, repo, next, sha);
  return { moved: true };
}

/** Only forgets the group; the window keeps whatever it currently has pinned. */
async function deletePinnedTabGroup(token: string, repo: string, groupId: string) {
  const { config, sha } = await readConfig(token, repo, true);
  const { name } = findGroup(config, groupId);
  await writeConfig(token, repo, removeGroup(config, groupId, new Date().toISOString()), sha);
  return { name };
}

// Message Handling
chrome.runtime.onMessage.addListener((message: Message | any, sender, sendResponse) => {
  if (message.type === 'AUTH_TOKEN_UPDATE' && message.token) {
    console.log('LifeOS Extension: Received token update');
    chrome.storage.local.set({
      lifeos_token: message.token,
      lifeos_repo: message.repo,
      lifeos_repos: message.repos || []
    }, () => {
      console.log('LifeOS Extension: Token & Repo data saved');
    });
    // A new token can mean a different account, whose repo file is a different list.
    chrome.storage.local.remove('bookmarksCache');
    return false;
  }

  if (message.type === 'DUMP_NOTE') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const targetPath = message.path || '.lifeos/dump.md';
        await githubUpsertFile(token, repo, targetPath, `- ${message.note?.trim()}`, 'top');
        sendResponse({ success: true });
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true; // Indicate async response
  }

  if (message.type === 'ADD_ACTION_LOG') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const targetPath = message.path || '.lifeos/dump.actionlog.md';

        // Generate timestamp YYYY-MM-DD HH:mm:ss
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        // Format description and tags
        let contentStr = `- ${timestamp} ${message.description?.trim() || ''}`;
        if (message.tags && message.tags.length > 0) {
          const tagsStr = message.tags.map((t: string) => `#${t.trim()}`).join(' ');
          contentStr += ` ${tagsStr}`;
        }

        await githubUpsertFile(token, repo, targetPath, contentStr, 'bottom');
        sendResponse({ success: true });
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true; // Indicate async response
  }

  if (message.type === 'FETCH_QUICK_NOTES') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const url = `https://api.github.com/repos/${repo}/contents/.lifeos/.dashboard.config.json`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        };
        const res = await fetch(url, { headers });
        if (!res.ok) {
          sendResponse({ quickNotes: [] });
          return;
        }
        const configData = await res.json();
        const content = decodeURIComponent(escape(atob(configData.content || '')));
        const config = JSON.parse(content);
        const quickNotes = config.files?.quickNotes || [];
        sendResponse({ quickNotes });
      } catch (error: any) {
        console.error('Failed to fetch quick notes:', error);
        sendResponse({ quickNotes: [] }); // default empty gracefully
      }
    });
    return true; // Indicate async response
  }

  if (message.type === 'GET_BOOKMARKS') {
    getBookmarks().then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'ADD_BOOKMARK') {
    bookmarkPage({
      url: message.url || '',
      title: message.title || '',
      tags: message.tags || [],
    }).then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'SET_BOOKMARK_PINNED') {
    pinBookmark(message.bookmarkId || '', message.pinned === true).then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'RECORD_BOOKMARK_USE') {
    recordBookmarkUse(message.bookmarkId || '').then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'SYNC_NOW') {
    // Opening the popup is a good moment to check GitHub, but the hourly budget still applies
    // unless the user asked outright: a cache younger than that is left alone, counts and all.
    syncIfStale(message.force === true).then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'GET_RECENTS') {
    readRecents().then(
      (recents) => sendResponse({ success: true, recents }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'ADD_RECENT') {
    rememberRecent(message.entry).then(
      (recents) => sendResponse({ success: true, recents }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'GET_REPOS') {
    chrome.storage.local.get(['lifeos_repo', 'lifeos_repos']).then(
      (data) =>
        sendResponse({
          success: true,
          repo: (data.lifeos_repo as string) || 'lifosy/monorepo',
          repos: (data.lifeos_repos as { full_name: string }[] | undefined) ?? [],
        }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'SET_REPO') {
    // The caches carry the repo they came from, so they invalidate themselves on the next read.
    chrome.storage.local.set({ lifeos_repo: message.repo }).then(
      () => sendResponse({ success: true }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'SAVE_SELECTION') {
    saveToKnowledgeBase(message.text || '', message.url || '', message.title || '').then(
      () => sendResponse({ success: true }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'IMPORT_CHROME_BOOKMARKS') {
    importChromeBookmarks().then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'SEARCH_REPO') {
    searchRepo(message.query || '').then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'OPEN_URL') {
    // The palette lives in the page, so the url it sends is page-influenced; only schemes Chrome
    // can safely navigate to get a tab.
    if (!isOpenableUrl(message.url || '')) {
      sendResponse({ error: 'Refusing to open that URL' });
      return false;
    }
    // `reuse` is what the start page asks for: that tab is blank and about to be left behind, so
    // the page it opens takes it over instead of stacking a second tab next to it.
    const reuseTabId = message.reuse ? sender.tab?.id : undefined;
    const navigating =
      reuseTabId === undefined
        ? chrome.tabs.create({ url: message.url, active: true })
        : chrome.tabs.update(reuseTabId, { url: message.url });
    navigating.then(
      () => sendResponse({ success: true }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (
    message.type === 'LIST_PINNED_TAB_GROUPS' ||
    message.type === 'LOAD_PINNED_TAB_GROUP' ||
    message.type === 'SAVE_PINNED_TAB_GROUP' ||
    message.type === 'RENAME_PINNED_TAB_GROUP' ||
    message.type === 'MOVE_PINNED_TAB_GROUP' ||
    message.type === 'DELETE_PINNED_TAB_GROUP'
  ) {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        if (message.type === 'LIST_PINNED_TAB_GROUPS') {
          sendResponse({ success: true, ...(await listPinnedTabGroups(token, repo)) });
        } else if (message.type === 'LOAD_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await loadPinnedTabGroup(token, repo, message.groupId)),
          });
        } else if (message.type === 'SAVE_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await savePinnedTabGroup(token, repo, message.groupId, message.name)),
          });
        } else if (message.type === 'RENAME_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await renamePinnedTabGroup(token, repo, message.groupId, message.name)),
          });
        } else if (message.type === 'MOVE_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await movePinnedTabGroup(token, repo, message.groupId, message.offset)),
          });
        } else {
          sendResponse({
            success: true,
            ...(await deletePinnedTabGroup(token, repo, message.groupId)),
          });
        }
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true; // Indicate async response
  }

  if (message.type === 'PIN_ARTICLE') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const { title, url, text, images } = message as {
          title: string;
          url: string;
          text: string;
          images?: string[];
        };
        const stamp = `${Date.now()}-${urlToSlug(url)}`;
        const body = await localizeImages(text, images ?? [], `${KB_ASSET_DIR}/${stamp}`, (path, base64) =>
          githubPutBase64(token, repo, path, base64),
        );
        const date = new Date().toISOString().slice(0, 10);
        const content = buildRawNote({ title, url, text: body, tags: ['general'], date });
        await githubUpsertFile(token, repo, `${KB_RAW_DIR}/${stamp}.md`, content);
        sendResponse({ success: true });
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true;
  }
});

async function saveToKnowledgeBase(text: string, url: string, pageTitle: string) {
  const { token, repo } = await credentials();
  if (!token) throw new Error('No token found');
  if (!text.trim()) throw new Error('Select some text first');

  const date = new Date().toISOString().slice(0, 10);
  const content = buildRawNote({
    title: `Clipping: ${pageTitle || url}`,
    url,
    text: selectionText(text, url, pageTitle),
    tags: ['clipping'],
    date,
  });
  const path = `${KB_RAW_DIR}/${Date.now()}-${slugify(pageTitle, 'clipping')}.md`;
  await githubUpsertFile(token, repo, path, content);
}
