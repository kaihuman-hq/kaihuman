import {
  addActionLogEntry,
  addEventEntry,
  addReadLaterEntry,
  addTodoEntry,
  braindumpIdOf,
  checkIn,
  ideaSlugOf,
  localDate,
  markReadItLaterRead,
  PALETTE_SETTINGS_PATH,
  parseTimeTracking,
  serializeTimeTracking,
  toggleStartStop,
} from '@kaihuman/formats';
import {
  type GithubWorkFilter,
  isKnowledgePath,
  withModeRecent,
  withTranslationText,
} from '@kaihuman/palette';
import { consoleFileUrl, isConsolePage } from '../console';
// The bundled loader's path, for injecting the page script on demand (CRXJS `?script` import).
import PAGE_SCRIPT from '../content/index.ts?script';
import type { Message } from '../types';
import { draftBookmark, findDuplicates, findExactDuplicates } from './ai/bookmark-draft.js';
import { precomputeBrief, precomputeFocus, readAiCards } from './ai/brief.js';
import { precomputeTldrs, readTldrs } from './ai/tldr.js';
import { peek, put } from './ai/cache.js';
import { captureContext, classifyCapture } from './ai/capture.js';
import { buildWorkContext } from './ai/context.js';
import { digestToday } from './ai/digest.js';
import {
  enrichCapture,
  enrichReadLater,
  fetchImageBlobs,
  readMinutes,
  withAltText,
  within,
} from './ai/enrich.js';
import { precomputeInboxLabels } from './ai/labels.js';
import {
  AI_ALARM,
  ensureAiAlarm,
  precomputeInBackground,
  registerPrecompute,
} from './ai/precompute.js';
import { likelyNext, type Ranking, readLaterForToday } from './ai/rank.js';
import { bulletsOf, draftReview, type ReviewRange, reviewSources } from './ai/review.js';
import { readAiSettings } from './ai/settings.js';
import { translateOnDevice } from './ai/translate.js';
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
import { type ChromeBookmarkNode, flattenChromeBookmarks } from './chrome-bookmarks';
import {
  buildRawNote,
  type CaptureType,
  imagesEnabled,
  KB_ASSET_DIR,
  KB_IMAGES_SETTING,
  KB_RAW_DIR,
  localizeImages,
  selectionText,
  slugify,
  urlToSlug,
} from './kb-capture';
import {
  encodePath,
  fetchEntryFilePaths,
  fetchPromptFiles,
  isEntryFilePath,
  isGithubWorkFilter,
  isPromptsCacheStale,
  listGithubRepos,
  type PromptsCache,
  searchGithubWork,
  translateWithDeepl,
} from './palette-modes';
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
  setGroupFavorite,
  tabsToOpen,
  tabsToUnpin,
  toPinnedTabs,
} from './pinned-tabs';
import { syncRepoWithDesktop, watchRepoChanges } from './repo-sync';
import {
  checkServices,
  DEFAULT_SERVICES,
  isStatusCacheFresh,
  parseStatusConfig,
  type ServiceStatusCache,
  STATUS_CONFIG_PATH,
} from './service-status';
import {
  buildToday,
  DEFAULT_ACTION_LOG_PATH,
  fetchToday,
  inboxPath,
  isTodayCacheStale,
  isTodayCacheUsable,
  knownReadLaterTags,
  readLaterPath,
  type TodayCache,
  unreadItems,
  withFile,
  withoutFile,
} from './today';
import {
  handlePinMenuClick,
  handleWorkMessage,
  pinCurrentTab,
  pinMenuFile,
  rebuildPinMenu,
  watchPinMenu,
} from './work/messages';
import {
  connectWorkPanel,
  ensureWorkAlarm,
  isPanelOpen,
  runWorkCycle,
  watchWorkTokens,
} from './work/poller';
import { openWorkPanel } from './work/side-panel';
import { loadStreams } from './work/streams-store';
import { type StreamsCache, WORK_KEYS, type WorkSnapshot } from './work/types';

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

// Work streams poll GitHub on their own schedule; the cycle decides each minute what is due.
ensureWorkAlarm().catch((e) => console.warn('kaihuman: creating the work alarm failed', e));
// On-device AI fills its cache hourly, and after each start page sync and work cycle.
ensureAiAlarm().catch((e) => console.warn('kaihuman: creating the AI alarm failed', e));
registerPrecompute({ id: 'rank:likely', group: 'newTab', run: precomputeLikelyNext });
registerPrecompute({ id: 'rank:readLater', group: 'newTab', run: precomputeReadLater });
registerPrecompute({ id: 'inbox:labels', group: 'sidePanel', run: precomputeLabels });
registerPrecompute({ id: 'inbox:tldr', group: 'sidePanel', run: precomputeTldrs });
watchWorkTokens();
watchPinMenu();

// The desktop palette hears of a repository chosen here at once, and is asked for its own choice
// hourly and when a start page opens.
watchRepoChanges();

/** A start page asks at most this often, since each ask starts the desktop's host process. */
const REPO_SYNC_INTERVAL_MS = 30_000;
let repoSyncedAt = 0;

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'swKeepAlive') {
    // Also a backstop for the work alarm: the cycle is time-gated by its poll state, so this
    // costs no extra GitHub calls.
    runWorkCycle({ panelOpen: isPanelOpen() })
      .then(() => precomputeInBackground('work'))
      .catch((e) => console.warn('kaihuman: work polling failed', e));
  }
  if (alarm.name === 'repoSync') {
    syncRepoWithDesktop().catch((e) =>
      console.warn('kaihuman: repository sync with the desktop failed', e),
    );
    syncBookmarks().catch((e) => console.warn('kaihuman: bookmark sync failed', e));
    syncPinnedTabs().catch((e) => console.warn('kaihuman: pinned tab sync failed', e));
    syncToday().catch((e) => console.warn('kaihuman: start page sync failed', e));
  }
  if (alarm.name === AI_ALARM) precomputeInBackground('alarm');
  if (alarm.name === 'work') {
    runWorkCycle({ panelOpen: isPanelOpen() })
      .then(() => precomputeInBackground('work'))
      .catch((e) => console.warn('kaihuman: work polling failed', e));
  }
});

// An open port keeps the MV3 service worker from being collected. The popup holds one for
// as long as it is open, so a request fired after the user has spent a while typing (renaming
// a tab group, say) still finds the worker alive instead of racing its teardown — which
// surfaced as "The message port closed before a response was received".
chrome.runtime.onConnect.addListener((port) => {
  // Accepting the port is the whole job — holding it open is what keeps the worker alive.
  // The work side panel also refreshes its data as it opens.
  if (port.name === 'work-panel') {
    connectWorkPanel(port).catch((e) => console.warn('kaihuman: work panel refresh failed', e));
  }
});

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
 * Runs `deliver` against the page script, injecting the script first if it is not there.
 *
 * The page script (palette and article extraction) is not declared for every site: it is injected
 * only when the user acts on a tab — the shortcut, the popup or the context menu — which grants
 * `activeTab` for that tab, so the extension needs no standing access to every website.
 */
async function withPageScript(tabId: number, deliver: () => Promise<unknown>): Promise<boolean> {
  try {
    await deliver();
    return true;
  } catch {
    // Nothing listening yet — fall through and inject.
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [PAGE_SCRIPT] });
  } catch {
    // A page no extension may touch: chrome://, the Web Store, the PDF viewer, view-source.
    return false;
  }

  // The injected loader pulls the content script in as a module, so its message listener is only
  // in place a tick or two later.
  for (let attempt = 0; attempt < TOGGLE_RETRIES; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, TOGGLE_RETRY_MS));
    try {
      await deliver();
      return true;
    } catch {
      // Still coming up.
    }
  }
  return false;
}

/** Relays the shortcut to the tab, injecting the page script first if it is not there. */
async function openPaletteInTab(tabId: number): Promise<boolean> {
  // The start page is one of ours, and nothing may be injected into an extension page. It answers
  // a broadcast instead, which every open start page hears and only the visible one acts on.
  if (await isExtensionPage(tabId)) {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_COMMAND_PALETTE' }).catch(() => {});
    return true;
  }
  return withPageScript(tabId, () => togglePalette(tabId));
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
    await syncPinnedTabs().catch((e) => console.warn('kaihuman: pinned tab sync failed', e));
    await syncToday().catch((e) => console.warn('kaihuman: start page sync failed', e));
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

/** Each prefix mode's recently chosen ids, newest first, keyed by the mode's prefix. */
async function readModeRecents(): Promise<Record<string, string[]>> {
  const stored = await chrome.storage.local.get('modeRecents');
  const recents = stored.modeRecents as Record<string, string[]> | undefined;
  return recents && typeof recents === 'object' ? recents : {};
}

async function modeRecents(prefix: string) {
  const ids = (await readModeRecents())[prefix];
  return { ids: Array.isArray(ids) ? ids : [] };
}

async function rememberModeRecent(prefix: string, id: string) {
  if (!prefix || !id) throw new Error('A mode recent needs a prefix and an id');
  const all = await readModeRecents();
  const ids = withModeRecent(all[prefix] ?? [], id);
  await chrome.storage.local.set({ modeRecents: { ...all, [prefix]: ids } });
  return { ids };
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

  // `null` clears only this tab's own text; `''` would hide the Waiting-on-you count here.
  await chrome.action.setBadgeText({ tabId: tab.id, text: null as unknown as string });
  if (await openPaletteInTab(tab.id)) return;

  console.warn(`kaihuman: the palette cannot run on this page (${tab.url ?? 'unknown'})`);
  await flagPaletteFailure(tab.id);
});

// The shortcut counts as the user's action, which `sidePanel.open` needs, so the panel opens here.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-work-panel') return;
  openWorkPanel(tab?.windowId).catch((e) =>
    console.warn('kaihuman: opening the work panel failed', e),
  );
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'pin-current-tab') return;
  pinCurrentTab().catch((e) => console.warn('kaihuman: pinning the tab failed', e));
});

// Initialize Context Menu
chrome.runtime.onInstalled.addListener(async () => {
  // Drops items an older version registered, so one under a since-renamed id does not linger.
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'kaihuman-save-knowledge',
    title: 'Add to Knowledge Base',
    contexts: ['selection'],
  });
  const cached = await chrome.storage.local.get(WORK_KEYS.streamsCache);
  await rebuildPinMenu(pinMenuFile(cached[WORK_KEYS.streamsCache] as StreamsCache | undefined));

  // Chrome drops a `suggested_key` it cannot honour — because the OS, another extension or Chrome
  // itself already owns the combination — and leaves the command unbound without saying so. Say so
  // here, since "the shortcut does nothing" looks identical to a broken extension.
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === 'toggle-command-palette')?.shortcut;
  if (shortcut) {
    console.log(`kaihuman: command palette bound to ${shortcut}`);
  } else {
    console.warn(
      'kaihuman: no shortcut is bound to the command palette — assign one at chrome://extensions/shortcuts',
    );
  }
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kaihuman-save-knowledge' && info.selectionText) {
    saveToKnowledgeBase(info.selectionText, tab?.url || '', tab?.title || '').catch((e) =>
      console.error('kaihuman: Error saving clipping', e),
    );
  }
  handlePinMenuClick(info, tab);
});

// Add comprehensive GitHub API helper
async function githubUpsertFile(
  token: string,
  repoUrl: string,
  filePath: string,
  newContentLines: string,
  position: 'top' | 'bottom' = 'bottom',
) {
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
      ? position === 'top'
        ? `${newContentLines}\n\n${currentContent}`
        : `${currentContent}\n\n${newContentLines}`
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

/**
 * GitHub answers over HTTP/2, which has no status text, so the reason has to come from the body.
 * It also answers 404 rather than 403 when a token may not write to a repo it can see.
 */
async function githubFailure(res: Response, action: string): Promise<Error> {
  const body = await Promise.resolve()
    .then(() => res.json())
    .catch(() => null);
  const reason = (body as { message?: string } | null)?.message || res.statusText;
  const hint =
    res.status === 404 && action.startsWith('Failed to write')
      ? ' — check that the token may write to this repository'
      : '';
  return new Error(`${action}: ${res.status}${reason ? ` ${reason}` : ''}${hint}`);
}

// Unlike githubUpsertFile this replaces the file wholesale, which is what a
// snapshot-style JSON document needs.
async function githubReadFile(
  token: string,
  repoUrl: string,
  filePath: string,
): Promise<{ content: string; sha: string } | null> {
  // GitHub marks these cacheable for a minute; a read that feeds a write must not see an old one.
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await githubFailure(res, `Failed to read ${filePath}`);
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
  if (!res.ok) throw await githubFailure(res, `Failed to write ${filePath}`);
  // The commit response carries the new blob sha, so the cache can be refreshed without a re-read.
  const written = await res.json().catch(() => null);
  return written?.content?.sha ?? null;
}

/** Deletes the version `sha` names; one already gone is fine. */
async function githubDeleteFile(
  token: string,
  repoUrl: string,
  filePath: string,
  sha: string,
  message: string,
) {
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    body: JSON.stringify({ message, sha }),
  });
  if (res.status === 404) return;
  if (!res.ok) throw await githubFailure(res, `Failed to delete ${filePath}`);
}

/** Creates a file from already-encoded bytes, e.g. an image downloaded for the knowledge base. */
async function githubPutBase64(token: string, repoUrl: string, filePath: string, base64: string) {
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    body: JSON.stringify({ message: `Add ${filePath} via Extension`, content: base64 }),
  });
  if (!res.ok) throw await githubFailure(res, `Failed to write ${filePath}`);
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
        syncPinnedTabs().catch((e) => console.warn('kaihuman: pinned tab refresh failed', e));
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

/** Without a repository there is nowhere to read or write, so a token alone does not connect. */
async function credentials(): Promise<{ token?: string; repo: string }> {
  const data = await chrome.storage.local.get(['lifeos_token', 'lifeos_repo']);
  const repo = (data.lifeos_repo as string | undefined) ?? '';
  return { token: repo ? (data.lifeos_token as string | undefined) : undefined, repo };
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
      syncBookmarks().catch((e) => console.warn('kaihuman: bookmark refresh failed', e));
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

const NOT_LOGGED_IN = 'Not connected — open the kaihuman console and pick a repository';

/** Prompt files for `>p`, command files for `>x` — found, fetched and cached the same way. */
const REPO_FILE_KINDS = {
  prompts: { suffix: '.prompts.md', cacheKey: 'promptsCache' },
  commands: { suffix: '.commands.md', cacheKey: 'commandsCache' },
} as const;

async function refreshRepoFiles(
  kind: keyof typeof REPO_FILE_KINDS,
  token: string,
  repo: string,
): Promise<PromptsCache> {
  const { suffix, cacheKey } = REPO_FILE_KINDS[kind];
  const files = await fetchPromptFiles(token, repo, suffix);
  const cache: PromptsCache = { repo, files, fetchedAt: Date.now() };
  await chrome.storage.local.set({ [cacheKey]: cache });
  return cache;
}

/** Cache first, like the bookmarks: a stale cache still answers and is refreshed behind it. */
async function listRepoFiles(kind: keyof typeof REPO_FILE_KINDS) {
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  const { cacheKey } = REPO_FILE_KINDS[kind];
  const stored = await chrome.storage.local.get(cacheKey);
  const cache = stored[cacheKey] as PromptsCache | undefined;
  if (cache?.repo !== repo) return { files: (await refreshRepoFiles(kind, token, repo)).files };
  if (isPromptsCacheStale(cache, Date.now())) {
    refreshRepoFiles(kind, token, repo).catch((e) =>
      console.warn(`kaihuman: ${kind} refresh failed`, e),
    );
  }
  return { files: cache.files };
}

interface PaletteSettingsCache {
  repo: string;
  /** The file as read; null when the repository has none, which means the defaults. */
  content: string | null;
  fetchedAt: number;
}

async function refreshPaletteSettings(token: string, repo: string) {
  const file = await githubReadFile(token, repo, PALETTE_SETTINGS_PATH);
  const cache: PaletteSettingsCache = {
    repo,
    content: file?.content ?? null,
    fetchedAt: Date.now(),
  };
  await chrome.storage.local.set({ paletteSettingsCache: cache });
  return cache;
}

/**
 * Asked every time the palette opens, so cache first like the prompts: a stale cache still answers
 * and is refreshed behind it — a change in the console reaches the palette on a later open.
 */
async function paletteSettings() {
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  const stored = await chrome.storage.local.get('paletteSettingsCache');
  const cache = stored.paletteSettingsCache as PaletteSettingsCache | undefined;
  if (cache?.repo !== repo) return { content: (await refreshPaletteSettings(token, repo)).content };
  if (isPromptsCacheStale(cache, Date.now())) {
    refreshPaletteSettings(token, repo).catch((e) =>
      console.warn('kaihuman: palette settings refresh failed', e),
    );
  }
  return { content: cache.content };
}

async function translate(text: string, targets: string[]) {
  const { deepl_key: key } = await chrome.storage.local.get('deepl_key');
  // The on-device Translator covers a missing key and an offline DeepL, unless palette AI is off.
  const onDevice = (await readAiSettings()).palette !== false;
  if (!key) {
    if (!onDevice) throw new Error('No DeepL API key yet — run “Set the DeepL API key…” first');
    return { translations: await translateOnDevice(text, targets) };
  }
  try {
    return { translations: await translateWithDeepl(key as string, text, targets) };
  } catch (failure) {
    if (!onDevice) throw failure;
    try {
      return { translations: await translateOnDevice(text, targets) };
    } catch {
      throw failure;
    }
  }
}

async function readTranslationHistory(): Promise<string[]> {
  const stored = await chrome.storage.local.get('translationHistory');
  return (stored.translationHistory as string[] | undefined) ?? [];
}

async function rememberTranslation(text: string): Promise<string[]> {
  const texts = withTranslationText(await readTranslationHistory(), text);
  await chrome.storage.local.set({ translationHistory: texts });
  return texts;
}

async function setTranslationKey(key: string) {
  if (key) await chrome.storage.local.set({ deepl_key: key });
  else await chrome.storage.local.remove('deepl_key');
}

async function githubWork(filter: GithubWorkFilter) {
  const { token } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  return searchGithubWork(token, filter);
}

async function githubRepos() {
  const { token } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  return { repos: await listGithubRepos(token) };
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
      favorite: group.favorite === true,
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

/** Answers with the list as `LIST_PINNED_TAB_GROUPS` does, so the page redraws from the commit. */
async function favoritePinnedTabGroup(
  token: string,
  repo: string,
  groupId: string,
  favorite: boolean,
) {
  const { config, sha } = await readConfig(token, repo, true);
  const next = setGroupFavorite(config, groupId, favorite, new Date().toISOString());
  await writeConfig(token, repo, next, sha);
  return listPinnedTabGroups(token, repo);
}

/** Only forgets the group; the window keeps whatever it currently has pinned. */
async function deletePinnedTabGroup(token: string, repo: string, groupId: string) {
  const { config, sha } = await readConfig(token, repo, true);
  const { name } = findGroup(config, groupId);
  await writeConfig(token, repo, removeGroup(config, groupId, new Date().toISOString()), sha);
  return { name };
}

/** What is already saved, for finding duplicates; read-only. */
async function savedEntries(bookmarks: Bookmark[]) {
  const today = await readTodayCache();
  const readLater = (today?.files ?? [])
    .filter((file) => file.path.endsWith('.readitlater.json'))
    .flatMap((file) => unreadItems(file.content));
  // Streams are a nicety here: signed out or a failed read only means fewer duplicates found.
  const streams = await loadStreams().catch(() => undefined);
  return { bookmarks, readLater, streams: streams?.state.ok ? streams.state.file : null };
}

/** Exact duplicates only: no model, so the form can show them at once (spec F12). */
async function bookmarkDuplicates(url: string) {
  const { bookmarks } = await getBookmarks();
  return { duplicates: findExactDuplicates({ url }, await savedEntries(bookmarks)) };
}

/**
 * A title, tags and environment for the page being bookmarked, and where it is already saved
 * (near copies too). Read-only: the repo is only written when the user saves.
 */
async function bookmarkDraft(url: string, title: string) {
  const { bookmarks } = await getBookmarks();
  const counts = new Map<string, number>();
  for (const tag of bookmarks.flatMap((bookmark) => bookmark.tags)) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const knownTags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([tag]) => tag);
  const page = { url, title };
  const [draft, duplicates] = await Promise.all([
    draftBookmark(page, knownTags),
    savedEntries(bookmarks).then((saved) => findDuplicates(page, saved)),
  ]);
  return { draft, duplicates };
}

async function readTodayCache(): Promise<TodayCache | undefined> {
  const stored = await chrome.storage.local.get('todayCache');
  return stored.todayCache as TodayCache | undefined;
}

/** What the on-device cards are written from; null while signed out or before the first sync. */
async function cardInputs() {
  const todayCache = await readTodayCache();
  if (!todayCache) return null;
  const streams = await loadStreams().catch(() => undefined);
  const snapshot = (await chrome.storage.local.get(WORK_KEYS.snapshot))[WORK_KEYS.snapshot];
  return {
    today: buildToday(todayCache, new Date()),
    todayCache,
    streams: streams?.state.ok ? streams.state.file : null,
    snapshot: snapshot as WorkSnapshot | undefined,
  };
}

registerPrecompute({ id: 'card:focus', group: 'newTab', run: () => precomputeFocus(cardInputs) });
registerPrecompute({ id: 'card:brief', group: 'newTab', run: () => precomputeBrief(cardInputs) });

/** The start page's files, on the same hourly budget as the bookmarks. */
async function syncToday(): Promise<TodayCache | undefined> {
  const { token, repo } = await credentials();
  if (!token) return undefined;
  const next = await fetchToday(token, repo, await readTodayCache());
  await chrome.storage.local.set({ todayCache: next });
  precomputeInBackground('today');
  return next;
}

const LIKELY_KEY = 'rank:likely';
const READ_LATER_KEY = 'rank:readLater';
const RANKING_TTL_MS = 60 * 60 * 1000;

/** The summary with the cached read-later order. The model is never called from here (D2). */
async function todayWithRanking(cache: TodayCache) {
  return buildToday(cache, new Date(), await peek<Ranking>(READ_LATER_KEY));
}

/** What the ranking jobs tell the model about the user's work; undefined until there is a cache. */
async function rankingContext() {
  const cache = await readTodayCache();
  if (!cache) return undefined;
  const streams = await loadStreams().catch(() => undefined);
  const snapshot = (await chrome.storage.local.get(WORK_KEYS.snapshot))[WORK_KEYS.snapshot];
  return {
    cache,
    ctx: buildWorkContext({
      today: buildToday(cache, new Date()),
      todayCache: cache,
      streams: streams?.state.ok ? streams.state.file : null,
      snapshot: snapshot as WorkSnapshot | undefined,
    }),
  };
}

async function precomputeLikelyNext() {
  const work = await rankingContext();
  if (!work) return;
  const { bookmarks } = await getBookmarks();
  await put(LIKELY_KEY, await likelyNext(bookmarks, work.ctx, new Date()), RANKING_TTL_MS);
}

async function precomputeLabels() {
  const snapshot = (await chrome.storage.local.get(WORK_KEYS.snapshot))[WORK_KEYS.snapshot];
  if (!snapshot) return;
  const streams = await loadStreams().catch(() => undefined);
  await precomputeInboxLabels(
    snapshot as WorkSnapshot,
    streams?.state.ok ? streams.state.file : null,
  );
}

async function precomputeReadLater() {
  const work = await rankingContext();
  if (!work) return;
  const items = work.cache.files
    .filter((file) => file.path.toLowerCase().endsWith('.readitlater.json'))
    .flatMap((file) => unreadItems(file.content));
  await put(READ_LATER_KEY, await readLaterForToday(items, work.ctx), RANKING_TTL_MS);
}

/** Cache first, like the bookmarks: a new tab never waits on GitHub unless there is no cache. */
async function getToday() {
  const { repo } = await credentials();
  let cache = await readTodayCache();
  if (isTodayCacheUsable(cache, repo) && cache) {
    if (isTodayCacheStale(cache)) {
      syncToday().catch((e) => console.warn('kaihuman: start page refresh failed', e));
    }
  } else {
    cache = await syncToday();
    if (!cache) throw new Error(NOT_LOGGED_IN);
  }
  return {
    today: await todayWithRanking(cache),
    ranking: { likely: await peek<Ranking>(LIKELY_KEY) },
  };
}

/**
 * A start page opening: the braindumps must be fresh (the desktop writes them a minute before),
 * so a cache older than this is checked. The tree request carries its ETag, so an unchanged repo
 * costs a 304, which GitHub does not bill.
 */
const TODAY_FRESH_MS = 60_000;

/** Answers `today: null` when the cache is fresh enough to keep. */
async function refreshToday() {
  const { repo } = await credentials();
  const cache = await readTodayCache();
  if (cache && isTodayCacheUsable(cache, repo) && Date.now() - cache.fetchedAt < TODAY_FRESH_MS) {
    return { today: null };
  }
  const next = await syncToday();
  if (!next) throw new Error(NOT_LOGGED_IN);
  return { today: await todayWithRanking(next) };
}

/**
 * The traffic lights. The services come from the repo's config, which the start page's own sync
 * already carries, and their statuses are checked at most every five minutes — when a start page
 * asks, so a browser with no new tab open checks nothing.
 */
async function getServiceStatus(refresh = false) {
  const { repo } = await credentials();
  const today = await readTodayCache();
  const file = isTodayCacheUsable(today, repo)
    ? today?.files.find((candidate) => candidate.path === STATUS_CONFIG_PATH)
    : undefined;
  const services = file ? parseStatusConfig(file.content) : DEFAULT_SERVICES;

  const stored = await chrome.storage.local.get('serviceStatusCache');
  const cache = stored.serviceStatusCache as ServiceStatusCache | undefined;
  if (!refresh && cache && isStatusCacheFresh(cache, services)) return { statuses: cache.statuses };

  const statuses = await checkServices(
    services,
    cache?.statuses ?? [],
    fetch,
    Date.now(),
    (pattern) => chrome.permissions.contains({ origins: [pattern] }),
  );
  const next: ServiceStatusCache = { services, statuses, fetchedAt: Date.now() };
  await chrome.storage.local.set({ serviceStatusCache: next });
  return { statuses };
}

/**
 * Deletes a braindump the start page shows — but only the version it showed (`sha`): when the
 * desktop has written more since, nothing is deleted and the page gets the newer text to look at.
 */
async function deleteBraindump(path: string, sha: string) {
  // The path comes from a page, so only a braindump's own file can be named.
  if (!braindumpIdOf(path)) throw new Error(`${path} is not a braindump`);
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  let cache = await readTodayCache();
  if (!isTodayCacheUsable(cache, repo) || !cache) cache = await syncToday();
  if (!cache) throw new Error(NOT_LOGGED_IN);

  const file = await githubReadFile(token, repo, path);
  let next = withoutFile(cache, path);
  if (file && file.sha !== sha) {
    next = withFile(cache, { path, sha: file.sha, content: file.content });
    await chrome.storage.local.set({ todayCache: next });
    return {
      today: await todayWithRanking(next),
      refused: 'It changed since — this is the new text. Delete again to remove it.',
    };
  }
  if (file) await githubDeleteFile(token, repo, path, sha, `braindump: delete ${path}`);
  await chrome.storage.local.set({ todayCache: next });
  return { today: await todayWithRanking(next) };
}

/**
 * Commits one change to one of the start page's files and answers with the updated summary. The
 * file is re-read first, as every other write here does, so an edit made in the console since the
 * last sync is built on rather than overwritten.
 */
async function commitTodayFile(
  path: { path: string; suffix: string } | ((cache: TodayCache) => string),
  change: (content: string) => string,
) {
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  let cache = await readTodayCache();
  if (!isTodayCacheUsable(cache, repo) || !cache) cache = await syncToday();
  if (!cache) throw new Error(NOT_LOGGED_IN);

  const target = typeof path === 'function' ? path(cache) : path.path;
  // Only a file the page shows, of the kind the action is for, may be written from a message: a
  // habit check-in rewrites the whole file, which would wreck a todo list.
  if (
    typeof path !== 'function' &&
    (!target.toLowerCase().endsWith(path.suffix) ||
      !cache.files.some((file) => file.path === target))
  ) {
    throw new Error(`${target} is not one of the start page's ${path.suffix} files`);
  }
  // A file the tree listed can still read back as 404; writing it as new would lack the sha
  // GitHub needs. The synced copy has it, and a stale one fails as a conflict, not an overwrite.
  const file =
    (await githubReadFile(token, repo, target)) ??
    cache.files.find((known) => known.path === target);
  const content = change(file?.content ?? '');
  const sha = await githubWriteFile(token, repo, target, content, file?.sha);

  const next = withFile(cache, { path: target, sha: sha ?? '', content });
  await chrome.storage.local.set({ todayCache: next });
  return { today: await todayWithRanking(next) };
}

/**
 * Where a todo from the start page goes: the inbox, or another todo list the page knows. The inbox
 * may not exist yet, which is why it is not held to the cache's files.
 */
function todoTarget(cache: TodayCache, path: string | undefined): string {
  const inbox = inboxPath(cache);
  if (!path || path === inbox) return inbox;
  if (!path.toLowerCase().endsWith('.todos.md') || !cache.files.some((f) => f.path === path)) {
    throw new Error(`${path} is not one of the start page's .todos.md files`);
  }
  return path;
}

/** The capture box's guesses, from the synced files only: a new tab must not cost a request. */
async function captureGuesses(text: string) {
  const { repo } = await credentials();
  const cache = await readTodayCache();
  if (!cache || !isTodayCacheUsable(cache, repo)) return { guesses: [] };
  return { guesses: await classifyCapture(text, captureContext(cache, new Date())) };
}

/**
 * An action log entry from the popup or the start page, written as the console's Action Log widget
 * writes it, over the version read.
 */
async function addActionLog(path: string, description: string, tags: string[]) {
  // The whole file is rewritten, so only an action log may be.
  if (!path.toLowerCase().endsWith('.actionlog.md') || !isEntryFilePath(path)) {
    throw new Error(`Refusing to write to ${path}`);
  }
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  const file = await githubReadFile(token, repo, encodePath(path));
  const content = addActionLogEntry(file?.content ?? '', { description, tags });
  await githubWriteFile(token, repo, encodePath(path), content, file?.sha);
  return {};
}

/**
 * The standup or week review draft. Action logs are read from the repo, since the cache keeps
 * only their paths; the model writes the prose unless the side panel's AI switch is off.
 */
async function reviewDraft(range: ReviewRange) {
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  const todayCache = await readTodayCache();
  if (!todayCache || !isTodayCacheUsable(todayCache, repo)) {
    throw new Error('Nothing synced yet. Open the console once, then try again.');
  }
  const [logs, streams, stored, settings] = await Promise.all([
    Promise.all(
      todayCache.actionLogPaths.map((path) =>
        githubReadFile(token, repo, encodePath(path)).then(
          (file) => file?.content ?? '',
          () => '',
        ),
      ),
    ),
    loadStreams().catch(() => undefined),
    chrome.storage.local.get('workSnapshot'),
    readAiSettings(),
  ]);
  const sources = reviewSources(range, new Date(), {
    logs,
    streams: streams?.state.ok ? streams.state.file : null,
    snapshot: stored.workSnapshot as WorkSnapshot | undefined,
    todayCache,
  });
  const drafted = settings.sidePanel ? await draftReview(sources, range) : null;
  return { text: drafted ?? bulletsOf(sources), drafted: drafted !== null };
}

/** The files `>f` lists, each with its console link, as a repo search lists its hits. */
async function listEntryFiles() {
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  const paths = await fetchEntryFilePaths(token, repo);
  return {
    files: paths.map((path) => ({
      path,
      name: path.split('/').at(-1) ?? path,
      url: consoleFileUrl(path, repo),
    })),
  };
}

async function readEntryFile(path: string) {
  if (!isEntryFilePath(path)) throw new Error(`Refusing to read ${path}`);
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  return (await githubReadFile(token, repo, encodePath(path))) ?? { content: '' };
}

/** Writes over the version read; the start page's cache takes the new text if it shows the file. */
async function writeEntryFile(path: string, content: string, sha?: string) {
  if (!isEntryFilePath(path)) throw new Error(`Refusing to write ${path}`);
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  const written = await githubWriteFile(token, repo, encodePath(path), content, sha);
  const cache = await readTodayCache();
  if (cache && isTodayCacheUsable(cache, repo) && cache.files.some((file) => file.path === path)) {
    await chrome.storage.local.set({
      todayCache: withFile(cache, { path, sha: written ?? '', content }),
    });
  }
  return {};
}

/** Creates the palette's capture — no `sha`, so GitHub refuses to write over an existing file. */
async function captureKnowledge(path: string, content: string) {
  if (!isKnowledgePath(path)) throw new Error(`Refusing to write ${path}`);
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  await githubWriteFile(token, repo, path, content);
  return { url: consoleFileUrl(path, repo) };
}

/**
 * `>id`'s ideas, from the start page's tree sync. It runs on every ask, since a log line is
 * written over the version listed; the tree is replayed with its ETag and only changed files are
 * read, so an unchanged repo costs a 304.
 */
async function listIdeas() {
  const { repo } = await credentials();
  const cache = await syncToday();
  if (!cache) throw new Error(NOT_LOGGED_IN);
  const ideas = cache.files
    .filter((file) => ideaSlugOf(file.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path, sha, content }) => ({
      path,
      sha,
      text: content,
      url: consoleFileUrl(path, repo),
    }));
  return { ideas };
}

/**
 * Writes an idea: without `sha` only as a new file (GitHub refuses one that exists), with it only
 * over that version. The start page's cache takes the new text, so the next list has its sha.
 */
async function saveIdea(path: string, content: string, sha?: string) {
  // The path comes from a page, so only an idea's own file can be named.
  const slug = ideaSlugOf(path);
  if (!slug) throw new Error(`Refusing to write ${path}`);
  const { token, repo } = await credentials();
  if (!token) throw new Error(NOT_LOGGED_IN);
  let written: string | null;
  try {
    written = await githubWriteFile(token, repo, path, content, sha);
  } catch (error) {
    // 422: no sha for a file that exists; 409: the sha is no longer the file's version.
    if (error instanceof Error && /: (409|422)\b/.test(error.message)) {
      throw new Error(
        sha
          ? `The idea ${slug} changed since it was listed — open it again and retry`
          : `There is an idea ${slug} already`,
      );
    }
    throw error;
  }
  const cache = await readTodayCache();
  if (cache && isTodayCacheUsable(cache, repo)) {
    await chrome.storage.local.set({
      todayCache: withFile(cache, { path, sha: written ?? '', content }),
    });
  }
  return { url: consoleFileUrl(path, repo) };
}

/** How fresh the start page's data is, and what is still waiting to be pushed. */
async function syncStatus() {
  const { repo } = await credentials();
  const bookmarks = await readBookmarksCache();
  const today = await readTodayCache();
  const fetched = [
    isCacheUsable(bookmarks, repo) ? bookmarks?.fetchedAt : undefined,
    isTodayCacheUsable(today, repo) ? today?.fetchedAt : undefined,
  ].filter((at): at is number => typeof at === 'number');
  const usage = await readUsage(repo);
  return {
    // The oldest of the caches is what the page can vouch for.
    syncedAt: fetched.length ? Math.min(...fetched) : null,
    pendingOpens: Object.values(usage.deltas).reduce((sum, delta) => sum + delta.count, 0),
  };
}

const answer = (work: Promise<object>, sendResponse: (response: unknown) => void) => {
  work.then(
    (result) => sendResponse({ success: true, ...result }),
    (error) => sendResponse({ error: error.message }),
  );
  return true; // Indicate async response
};

// Message Handling
chrome.runtime.onMessage.addListener((message: Message | any, sender, sendResponse) => {
  // First and synchronous: the palette's ⏎ still counts as the user's action only until an await.
  if (message.type === 'OPEN_WORK_PANEL') {
    return answer(
      openWorkPanel(sender.tab?.windowId).then(() => ({})),
      sendResponse,
    );
  }

  const work = handleWorkMessage(message);
  if (work) return answer(work as Promise<object>, sendResponse);

  if (message.type === 'ENSURE_PAGE_SCRIPT') {
    return answer(
      withPageScript(message.tabId, () =>
        chrome.tabs.sendMessage(message.tabId, { type: 'PAGE_SCRIPT_PING' }),
      ).then((ready) => ({ ready })),
      sendResponse,
    );
  }

  if (message.type === 'AUTH_TOKEN_UPDATE' && message.token) {
    // The content script runs on every site; only a token coming from the console is trusted.
    if (!isConsolePage(sender.url)) return false;
    chrome.storage.local.set({
      lifeos_token: message.token,
      lifeos_repo: message.repo,
      lifeos_repos: message.repos || [],
    });
    // A new token can mean a different account, whose repo file is a different list.
    chrome.storage.local.remove('bookmarksCache');
    chrome.storage.local.remove('todayCache');
    return false;
  }

  if (message.type === 'DUMP_NOTE') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo;
      if (!token || !repo) {
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
    return answer(
      addActionLog(
        message.path || DEFAULT_ACTION_LOG_PATH,
        message.description || '',
        message.tags || [],
      ),
      sendResponse,
    );
  }

  if (message.type === 'FETCH_QUICK_NOTES') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo;
      if (!token || !repo) {
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

  if (message.type === 'BOOKMARK_DUPLICATES') {
    bookmarkDuplicates(String(message.url || '')).then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'BOOKMARK_DRAFT') {
    bookmarkDraft(String(message.url || ''), String(message.title || '')).then(
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

  if (message.type === 'GET_MODE_RECENTS') {
    return answer(modeRecents(message.prefix || ''), sendResponse);
  }

  if (message.type === 'ADD_MODE_RECENT') {
    return answer(rememberModeRecent(message.prefix || '', message.id || ''), sendResponse);
  }

  if (message.type === 'GET_REPOS') {
    chrome.storage.local.get(['lifeos_repo', 'lifeos_repos']).then(
      (data) =>
        sendResponse({
          success: true,
          repo: (data.lifeos_repo as string | undefined) ?? '',
          repos: (data.lifeos_repos as { full_name: string }[] | undefined) ?? [],
        }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'SYNC_REPO_WITH_DESKTOP') {
    if (Date.now() - repoSyncedAt < REPO_SYNC_INTERVAL_MS) {
      sendResponse({ success: true, changed: false });
      return false;
    }
    repoSyncedAt = Date.now();
    return answer(
      syncRepoWithDesktop().then((changed) => ({ changed })),
      sendResponse,
    );
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

  if (message.type === 'LIST_PROMPT_FILES' || message.type === 'LIST_COMMAND_FILES') {
    listRepoFiles(message.type === 'LIST_PROMPT_FILES' ? 'prompts' : 'commands').then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'LIST_ENTRY_FILES') return answer(listEntryFiles(), sendResponse);

  if (message.type === 'READ_ENTRY_FILE') {
    return answer(readEntryFile(message.path || ''), sendResponse);
  }

  if (message.type === 'WRITE_ENTRY_FILE') {
    return answer(
      writeEntryFile(message.path || '', message.content ?? '', message.sha),
      sendResponse,
    );
  }

  if (message.type === 'CAPTURE_KNOWLEDGE') {
    return answer(captureKnowledge(message.path || '', message.content ?? ''), sendResponse);
  }

  if (message.type === 'LIST_IDEAS') return answer(listIdeas(), sendResponse);

  if (message.type === 'SAVE_IDEA') {
    return answer(
      saveIdea(message.path || '', message.content ?? '', message.sha || undefined),
      sendResponse,
    );
  }

  if (message.type === 'TRANSLATE') {
    translate(message.text || '', message.targets || []).then(
      (result) => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'GET_TRANSLATION_HISTORY') {
    readTranslationHistory().then(
      (texts) => sendResponse({ success: true, texts }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'ADD_TRANSLATION_HISTORY') {
    rememberTranslation(message.text || '').then(
      (texts) => sendResponse({ success: true, texts }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'SET_TRANSLATION_KEY') {
    setTranslationKey((message.key || '').trim()).then(
      () => sendResponse({ success: true }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'GET_PALETTE_SETTINGS') return answer(paletteSettings(), sendResponse);

  if (message.type === 'LIST_GITHUB_WORK') {
    if (!isGithubWorkFilter(message.filter)) {
      sendResponse({ error: 'Unknown GitHub work filter' });
      return false;
    }
    githubWork(message.filter).then(
      (items) => sendResponse({ success: true, items }),
      (error) => sendResponse({ error: error.message }),
    );
    return true; // Indicate async response
  }

  if (message.type === 'LIST_GITHUB_REPOS') {
    githubRepos().then(
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
    message.type === 'FAVORITE_PINNED_TAB_GROUP' ||
    message.type === 'DELETE_PINNED_TAB_GROUP'
  ) {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo;
      if (!token || !repo) {
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
        } else if (message.type === 'FAVORITE_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await favoritePinnedTabGroup(
              token,
              repo,
              message.groupId,
              message.favorite === true,
            )),
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

  if (message.type === 'GET_TODAY') return answer(getToday(), sendResponse);

  if (message.type === 'GET_AI_CARDS') return answer(readAiCards(), sendResponse);

  if (message.type === 'GET_TLDRS') return answer(readTldrs(), sendResponse);

  if (message.type === 'REFRESH_TODAY') return answer(refreshToday(), sendResponse);

  if (message.type === 'GET_SERVICE_STATUS') {
    return answer(getServiceStatus(message.force === true), sendResponse);
  }

  if (message.type === 'DELETE_BRAINDUMP') {
    return answer(deleteBraindump(message.path || '', message.sha || ''), sendResponse);
  }

  if (message.type === 'GET_SYNC_STATUS') return answer(syncStatus(), sendResponse);

  if (message.type === 'TODAY_CHECK_IN') {
    const date = localDate(new Date());
    return answer(
      commitTodayFile({ path: message.path || '', suffix: '.habit.csv' }, (csv) =>
        checkIn(csv, date),
      ),
      sendResponse,
    );
  }

  if (message.type === 'TODAY_TOGGLE_TIMER') {
    const now = new Date();
    return answer(
      commitTodayFile({ path: message.path || '', suffix: '.timetracking.csv' }, (csv) =>
        serializeTimeTracking(toggleStartStop(parseTimeTracking(csv), now)),
      ),
      sendResponse,
    );
  }

  if (message.type === 'READ_LATER_DONE') {
    return answer(
      commitTodayFile({ path: message.path || '', suffix: '.readitlater.json' }, (json) =>
        markReadItLaterRead(json, message.id || ''),
      ),
      sendResponse,
    );
  }

  if (message.type === 'READ_LATER_ADD') {
    if (!isOpenableUrl(message.url || '')) {
      sendResponse({ error: 'Only web pages can be saved for later' });
      return false;
    }
    const page = {
      url: message.url,
      title: message.title || '',
      text: (message.text || '').trim(),
    };
    return answer(
      // A page already on the list is refused before the model is asked about it; the commit
      // below still checks the file itself.
      readTodayCache()
        .then((cache) => {
          const onList = (cache?.files ?? [])
            .filter((file) => file.path.toLowerCase().endsWith('.readitlater.json'))
            .some((file) => unreadItems(file.content).some((item) => item.url === page.url));
          if (onList) throw new Error('Already on the read-later list');
        })
        // Enriched first and committed after, so the file is not held open while the model works.
        .then(() => readLaterExtras(page))
        .then((extras) =>
          commitTodayFile(readLaterPath, (json) =>
            addReadLaterEntry(
              json,
              { url: page.url, title: page.title, ...extras },
              crypto.randomUUID(),
            ),
          ),
        ),
      sendResponse,
    );
  }

  if (message.type === 'ADD_TODO') {
    const now = new Date();
    const entry = {
      text: message.text || '',
      tags: (message.tags ?? []).filter((tag: unknown) => typeof tag === 'string'),
      milestoneId: message.milestoneId || undefined,
    };
    return answer(
      commitTodayFile(
        (cache) => todoTarget(cache, message.path),
        (md) => addTodoEntry(md, entry, now),
      ),
      sendResponse,
    );
  }

  if (message.type === 'ADD_EVENT') {
    const entry = {
      name: message.name || '',
      type: message.eventType || 'general',
      startDate: message.startDate || '',
      endDate: message.endDate,
    };
    return answer(
      commitTodayFile({ path: message.path || '', suffix: '.events.csv' }, (csv) =>
        addEventEntry(csv, entry),
      ),
      sendResponse,
    );
  }

  if (message.type === 'BRAINDUMP_DIGEST') {
    return answer(
      readTodayCache().then(async (cache) => ({ themes: (await digestToday(cache)) ?? [] })),
      sendResponse,
    );
  }

  if (message.type === 'REVIEW_DRAFT') {
    return answer(reviewDraft(message.range === 'week' ? 'week' : 'standup'), sendResponse);
  }

  if (message.type === 'CAPTURE_CLASSIFY') {
    return answer(captureGuesses(message.text || ''), sendResponse);
  }

  if (message.type === 'PIN_ARTICLE') {
    chrome.storage.local.get(
      ['lifeos_token', 'lifeos_repo', KB_IMAGES_SETTING],
      async (data: any) => {
        const token = data.lifeos_token;
        const repo = data.lifeos_repo;
        if (!token || !repo) {
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
          const toStore = imagesEnabled(data[KB_IMAGES_SETTING]) ? (images ?? []) : [];
          const { alts, ...extras } = await captureExtras({ title, text, imageUrls: toStore });
          // Alt text first: localizing rewrites the urls it is matched by.
          const described = withAltText(text, alts.srcs, alts.texts);
          const body = await localizeImages(
            described,
            toStore,
            `${KB_ASSET_DIR}/${stamp}`,
            (path, base64) => githubPutBase64(token, repo, path, base64),
          );
          const date = new Date().toISOString().slice(0, 10);
          const content = buildRawNote({
            title,
            url,
            text: body,
            tags: ['general', ...extras.tags],
            date,
            type: extras.type,
            summary: extras.summary,
          });
          await githubUpsertFile(token, repo, `${KB_RAW_DIR}/${stamp}.md`, content);
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ error: error.message });
        }
      },
    );
    return true;
  }
});

const ENRICH_BUDGET_MS = 8_000;

/** What a page saved for later gains on device; only the read time without the model. */
async function readLaterExtras(page: { url: string; title: string; text: string }) {
  if (!page.text) return {};
  const minutes = { readMinutes: readMinutes(page.text) };
  if (!(await readAiSettings()).enrichment) return minutes;
  const known = knownReadLaterTags(await readTodayCache());
  const { summary, tags } = await within<Awaited<ReturnType<typeof enrichReadLater>>>(
    ENRICH_BUDGET_MS,
    enrichReadLater(page, known),
    { tags: [] },
  );
  return { ...minutes, ...(summary ? { summary } : {}), tags };
}

/**
 * Summary, type, tags and image alt text for a knowledge base note. Tags come from those already
 * on the read-later list: the notes themselves live in the repo and are not read here.
 */
async function captureExtras(note: { title: string; text: string; imageUrls: string[] }) {
  const none = {
    summary: undefined as string[] | undefined,
    type: undefined as CaptureType | undefined,
    tags: [] as string[],
    alts: { srcs: [] as string[], texts: [] as string[] },
  };
  if (!(await readAiSettings()).enrichment) return none;
  const known = knownReadLaterTags(await readTodayCache());
  return within(
    ENRICH_BUDGET_MS,
    (async () => {
      const { srcs, blobs } = await fetchImageBlobs(note.imageUrls);
      const result = await enrichCapture(
        { title: note.title, text: note.text, images: blobs },
        known,
      );
      return { ...none, ...result, alts: { srcs, texts: result.alts } };
    })(),
    none,
  );
}

async function saveToKnowledgeBase(text: string, url: string, pageTitle: string) {
  const { token, repo } = await credentials();
  if (!token) throw new Error('No token found');
  if (!text.trim()) throw new Error('Select some text first');

  const date = new Date().toISOString().slice(0, 10);
  const extras = await captureExtras({ title: pageTitle || url, text, imageUrls: [] });
  const content = buildRawNote({
    title: `Clipping: ${pageTitle || url}`,
    url,
    text: selectionText(text, url, pageTitle),
    tags: ['clipping', ...extras.tags],
    date,
    type: extras.type,
    summary: extras.summary,
  });
  const path = `${KB_RAW_DIR}/${Date.now()}-${slugify(pageTitle, 'clipping')}.md`;
  await githubUpsertFile(token, repo, path, content);
}
