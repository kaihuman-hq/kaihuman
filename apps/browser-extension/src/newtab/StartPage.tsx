import { useEffect, useRef, useState } from 'preact/hooks';
import { type Bookmark, recentlyUsedBookmarks } from '../background/bookmarks';
import { CONSOLE_URL } from '../console';
import { repoActions, send, workerHandlers } from '../palette/actions';
import { type CommandPalette, createCommandPalette } from '../palette/command-palette';

/** Where the note box writes. Any other target is one palette action away ("Add a note…"), which
 * is also the only place that reads the repo's quick-note list — a new tab is opened far too often
 * to spend a GitHub request on it. */
const DUMP_PATH = '.lifeos/dump.md';

const DEFAULT_REPO = 'lifosy/monorepo';

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

  const recent = recentlyUsedBookmarks(bookmarks);

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
          Search bookmarks, the repo, and every action…
          <kbd class="text-xs border border-[var(--los-border)] rounded px-1.5 py-0.5">
            {isMac() ? '⌘⇧K' : 'Ctrl+Shift+K'}
          </kbd>
        </button>

        <section class="flex flex-col gap-3">
          <h2 class="text-xs uppercase tracking-wider text-[var(--los-muted)]">Recently used</h2>
          {bookmarksError ? (
            <p class="text-xs text-red-400">{bookmarksError}</p>
          ) : recent.length === 0 ? (
            <p class="text-xs text-[var(--los-muted)]">
              No bookmarks yet — bookmark a page from the popup or the palette.
            </p>
          ) : (
            <ul class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {recent.map((bookmark) => (
                <li key={bookmark.id}>
                  <button
                    type="button"
                    onClick={() => openBookmark(bookmark)}
                    class="w-full h-full flex flex-col gap-1 rounded border border-[var(--los-border)] p-3 text-left hover:border-[var(--los-accent)] transition-colors"
                    title={bookmark.url}
                  >
                    <span class="text-sm truncate">{bookmark.title}</span>
                    <span class="text-[10px] text-[var(--los-muted)] truncate">
                      {hostOf(bookmark.url)}
                    </span>
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
