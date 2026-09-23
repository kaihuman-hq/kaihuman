import { useEffect, useRef, useState } from 'preact/hooks';
import { type Bookmark, startPageBookmarks } from '../background/bookmarks';
import { CONSOLE_URL } from '../console';
import { repoActions, send, workerHandlers } from '../palette/actions';
import { type CommandPalette, createCommandPalette } from '../palette/command-palette';

/** Where the note box writes. Any other target is one palette action away ("Add a note…"), which
 * is also the only place that reads the repo's quick-note list — a new tab is opened far too often
 * to spend a GitHub request on it. */
const DUMP_PATH = '.lifeos/dump.md';

const DEFAULT_REPO = 'lifosy/monorepo';

/** What the worker lists for each saved group of pinned tabs — the popup's view of them too. */
interface TabGroupSummary {
  id: string;
  name: string;
  tabCount: number;
}

const plural = (count: number) => `${count} tab${count === 1 ? '' : 's'}`;

const isMac = () => navigator.userAgent.includes('Mac');

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Bookmarks and repo hits are remote input, so navigating goes through the worker exactly as it
 * does from a content script — one place where the scheme is checked. `reuse` takes this tab over
 * rather than leaving a blank start page behind.
 */
const openInThisTab = (url: string) => {
  send({ type: 'OPEN_URL', url, reuse: true }).catch((e) =>
    console.warn('LifeOS Extension: could not open', url, e),
  );
};

/**
 * The page Chrome shows on a new tab: the bookmarks you reach for, a note box, and the palette.
 *
 * Chrome keeps the focus in the address bar on an override page, so nothing here is autofocused and
 * the palette is opened by the extension shortcut — relayed by the worker, exactly as on a normal
 * page — or by clicking the search field.
 */
export function StartPage() {
  const [token, setToken] = useState<string | null>(null);
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  // One pin commit at a time: two in flight would race each other for the file's sha.
  const [pinning, setPinning] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [tabGroups, setTabGroups] = useState<TabGroupSummary[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [tabGroupsError, setTabGroupsError] = useState<string | null>(null);
  // One load at a time: two would each unpin what the other just pinned.
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [noteError, setNoteError] = useState<string | null>(null);

  // Built on first use, like the content script's, so a tab nobody searches from pays nothing.
  const paletteRef = useRef<CommandPalette | null>(null);
  const palette = () => {
    if (!paletteRef.current) {
      paletteRef.current = createCommandPalette({
        ...workerHandlers(),
        // This tab is a blank start page, so a hit takes it over rather than leaving it behind.
        open: openInThisTab,
        actions: repoActions,
      });
    }
    return paletteRef.current;
  };

  const refreshTabGroups = () =>
    send({ type: 'LIST_PINNED_TAB_GROUPS' }).then(
      (response) => {
        setTabGroups(response.groups);
        setActiveGroupId(response.activeId);
      },
      (e: Error) => setTabGroupsError(e.message),
    );

  useEffect(() => {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], (result) => {
      const storedToken = (result.lifeos_token as string) || null;
      setToken(storedToken);
      setRepo((result.lifeos_repo as string) || DEFAULT_REPO);
      if (!storedToken) return;
      // Served from the cache, which refreshes itself in the background when the hour is up.
      send({ type: 'GET_BOOKMARKS' }).then(
        (response) => setBookmarks(response.bookmarks),
        (e: Error) => setBookmarksError(e.message),
      );
      // Also served from a cache, so listing the groups costs no GitHub request either.
      void refreshTabGroups();
    });
  }, []);

  useEffect(() => {
    const listener = (
      message: { type?: string },
      _sender: unknown,
      respond: (r: unknown) => void,
    ) => {
      if (message?.type !== 'TOGGLE_COMMAND_PALETTE') return false;
      // The worker relays the shortcut to this tab, and — while this listener is still coming up,
      // since nothing can be injected into an extension page to fill the gap — broadcasts it to
      // every open start page. The visibility check is what keeps a broadcast from arming the
      // palette in background tabs.
      if (!document.hidden) palette().toggle();
      respond({ success: true });
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      paletteRef.current?.destroy();
    };
  }, []);

  // Both messages reach the worker in order, so the open is counted whatever the tab does next.
  const openBookmark = (bookmark: Bookmark) => {
    send({ type: 'RECORD_BOOKMARK_USE', bookmarkId: bookmark.id }).catch((e) =>
      console.warn('LifeOS Extension: could not count use of', bookmark.id, e),
    );
    openInThisTab(bookmark.url);
  };

  /**
   * Moves the card at once and commits behind it; a failure puts it back and says why. The worker
   * answers with the committed list, which also brings in anything the console changed since.
   */
  const togglePin = async (bookmark: Bookmark) => {
    const pinned = !bookmark.pinned;
    const setPinnedLocally = (value: boolean) =>
      setBookmarks((list) =>
        list.map((candidate) =>
          candidate.id === bookmark.id ? { ...candidate, pinned: value } : candidate,
        ),
      );
    setPinning(true);
    setPinError(null);
    setPinnedLocally(pinned);
    try {
      const response = await send({
        type: 'SET_BOOKMARK_PINNED',
        bookmarkId: bookmark.id,
        pinned,
      });
      setBookmarks(response.bookmarks);
    } catch (e: any) {
      setPinnedLocally(!pinned);
      setPinError(e.message || 'Could not save the pin');
    } finally {
      setPinning(false);
    }
  };

  /** Pins the group's tabs in this window beside the start page, which stays where it is. */
  const loadTabGroup = async (group: TabGroupSummary) => {
    setLoadingGroupId(group.id);
    setTabGroupsError(null);
    try {
      await send({ type: 'LOAD_PINNED_TAB_GROUP', groupId: group.id });
      await refreshTabGroups();
    } catch (e: any) {
      setTabGroupsError(e.message || `Could not load ${group.name}`);
    } finally {
      setLoadingGroupId(null);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setNoteStatus('saving');
    setNoteError(null);
    try {
      await send({ type: 'DUMP_NOTE', path: DUMP_PATH, note });
      setNote('');
      setNoteStatus('success');
      setTimeout(() => setNoteStatus('idle'), 2000);
    } catch (e: any) {
      setNoteError(e.message || 'Unknown error');
      setNoteStatus('error');
    }
  };

  const title = (
    <a
      href={CONSOLE_URL}
      class="text-2xl font-bold tracking-tight text-[var(--los-accent)] hover:underline"
      title={`Open ${CONSOLE_URL}`}
    >
      kaihuman
    </a>
  );

  if (!token) {
    return (
      <div class="life-os-root min-h-screen bg-[var(--los-bg)] text-[var(--los-fg)] font-mono flex flex-col items-center justify-center gap-4 p-6">
        {title}
        <p class="text-sm text-[var(--los-muted)]">Log in to the console to use this page.</p>
        <a
          href={CONSOLE_URL}
          class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold rounded hover:opacity-90"
        >
          Open Console
        </a>
      </div>
    );
  }

  const grid = startPageBookmarks(bookmarks);

  return (
    <div class="life-os-root min-h-screen bg-[var(--los-bg)] text-[var(--los-fg)] font-mono p-6">
      <div class="mx-auto w-full max-w-3xl flex flex-col gap-8">
        <header class="flex items-baseline justify-between gap-4 border-b border-[var(--los-border)] pb-3">
          {title}
          <span class="text-xs text-[var(--los-muted)] truncate" title={repo}>
            {repo}
          </span>
        </header>

        <button
          type="button"
          onClick={() => palette().toggle()}
          class="w-full flex items-center justify-between gap-4 rounded border border-[var(--los-border)] px-4 py-3 text-left text-sm text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-fg)] transition-colors"
        >
          Search bookmarks, the repo, the web, and every action…
          <kbd class="text-xs border border-[var(--los-border)] rounded px-1.5 py-0.5">
            {isMac() ? '⌘⇧K' : 'Ctrl+Shift+K'}
          </kbd>
        </button>

        <section class="flex flex-col gap-3">
          <h2 class="text-xs uppercase tracking-wider text-[var(--los-muted)]">Pinned tabs</h2>
          {tabGroupsError && <p class="text-xs text-red-400 break-words">{tabGroupsError}</p>}
          {tabGroups.length === 0 ? (
            !tabGroupsError && (
              <p class="text-xs text-[var(--los-muted)]">
                No tab groups yet — pin some tabs and save them from the popup.
              </p>
            )
          ) : (
            <ul aria-label="Pinned tab groups" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {tabGroups.map((group) => {
                const active = group.id === activeGroupId;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      onClick={() => void loadTabGroup(group)}
                      disabled={loadingGroupId !== null}
                      aria-current={active}
                      title={
                        active
                          ? `${group.name} is loaded — click to restore its pinned tabs`
                          : `Pin the tabs of ${group.name} in this window`
                      }
                      class={`w-full flex items-baseline justify-between gap-2 rounded border px-3 py-1.5 text-left hover:border-[var(--los-accent)] transition-colors disabled:opacity-50 ${
                        active ? 'border-[var(--los-accent)]' : 'border-[var(--los-border)]'
                      }`}
                    >
                      <span class="text-sm truncate">{group.name}</span>
                      <span class="shrink-0 text-[10px] text-[var(--los-muted)]">
                        {loadingGroupId === group.id ? 'Loading…' : plural(group.tabCount)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-xs uppercase tracking-wider text-[var(--los-muted)]">
            Pinned &amp; recently used
          </h2>
          {pinError && <p class="text-xs text-red-400 break-words">{pinError}</p>}
          {bookmarksError ? (
            <p class="text-xs text-red-400">{bookmarksError}</p>
          ) : grid.length === 0 ? (
            <p class="text-xs text-[var(--los-muted)]">
              No bookmarks yet — bookmark a page from the popup or the palette.
            </p>
          ) : (
            <ul aria-label="Bookmarks" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {grid.map((bookmark) => (
                // The pin sits beside the card rather than inside it: a button cannot hold a button.
                <li key={bookmark.id} class="relative">
                  <button
                    type="button"
                    onClick={() => openBookmark(bookmark)}
                    class={`w-full h-full flex flex-col gap-1 rounded border p-3 pr-9 text-left hover:border-[var(--los-accent)] transition-colors ${
                      bookmark.pinned ? 'border-[var(--los-accent)]' : 'border-[var(--los-border)]'
                    }`}
                    title={bookmark.url}
                  >
                    <span class="text-sm truncate">{bookmark.title}</span>
                    <span class="text-[10px] text-[var(--los-muted)] truncate">
                      {hostOf(bookmark.url)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void togglePin(bookmark)}
                    disabled={pinning}
                    aria-pressed={bookmark.pinned}
                    aria-label={
                      bookmark.pinned ? `Unpin ${bookmark.title}` : `Pin ${bookmark.title}`
                    }
                    title={bookmark.pinned ? 'Unpin' : 'Pin to the top'}
                    class={`absolute top-2 right-2 p-1 rounded transition-colors disabled:opacity-50 ${
                      bookmark.pinned
                        ? 'text-[var(--los-accent)] hover:text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-accent)]'
                    }`}
                  >
                    {/* lucide "pin" */}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={bookmark.pinned ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 17v5" />
                      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex items-baseline justify-between gap-4">
            <h2 class="text-xs uppercase tracking-wider text-[var(--los-muted)]">Dump note</h2>
            <span class="text-[10px] text-[var(--los-muted)]" title={`${repo}/${DUMP_PATH}`}>
              {DUMP_PATH}
            </span>
          </div>
          <textarea
            value={note}
            onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            class="w-full min-h-[120px] rounded border border-[var(--los-border)] bg-transparent p-3 text-sm focus:border-[var(--los-accent)] focus:outline-none resize-y"
            placeholder="Something to write down…"
          />
          {noteStatus === 'error' && noteError && (
            <p class="text-xs text-red-400 break-words">{noteError}</p>
          )}
          <button
            type="button"
            onClick={() => void addNote()}
            disabled={noteStatus === 'saving' || !note.trim()}
            class="self-start px-4 py-2 rounded bg-[var(--los-accent)] text-black text-xs font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {noteStatus === 'saving' ? 'Saving…' : noteStatus === 'success' ? 'Added!' : 'Add note'}
          </button>
        </section>
      </div>
    </div>
  );
}
