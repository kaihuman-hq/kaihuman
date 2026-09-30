import {
  type CommandPalette,
  commandsMode,
  copyToClipboard,
  createCommandPalette,
  paletteModes,
  portHandlers,
  repoActions,
  splitTags,
} from '@lifosy/palette';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  type Bookmark,
  bookmarkEnvironment,
  type Environment,
  hostOf,
  startPageBookmarks,
} from '../background/bookmarks';
import { DEFAULT_ACTION_LOG_PATH, type TodaySummary } from '../background/today';
import { CONSOLE_URL, consoleFileUrl } from '../console';
import { send, workerPort } from '../palette/port';
import {
  Clocks,
  ComingUp,
  Doing,
  dateLine,
  ReadLater,
  SectionHead,
  SyncStatus,
  Trackers,
} from './Today';

/** Where the note box writes. Any other target is one palette action away ("Add a note…"), which
 * is also the only place that reads the repo's quick-note list — a new tab is opened far too often
 * to spend a GitHub request on it. */
const DUMP_PATH = '.lifeos/dump.md';

const DEFAULT_REPO = 'lifosy/monorepo';

/** What the capture box writes: a note to the dump, a todo to the inbox, or an action log entry. */
type CaptureKind = 'note' | 'todo' | 'log';

const CAPTURE: Record<CaptureKind, { label: string; placeholder: string; submit: string }> = {
  note: { label: 'Note', placeholder: 'Something to write down…', submit: 'Add note' },
  todo: { label: 'Todo', placeholder: 'Something to do… #tags', submit: 'Add todo' },
  log: { label: 'Log', placeholder: 'What happened? #tags', submit: 'Log' },
};

/** A capture as the list under the box shows it. */
interface Captured {
  time: string;
  text: string;
}

type CaptureLog = Record<CaptureKind, Captured[]>;

/** `chrome.storage.local` key of the latest captures, so the list outlives the tab. */
const CAPTURE_LOG_KEY = 'startPageCaptures';
const CAPTURE_LOG_LIMIT = 5;
const EMPTY_CAPTURE_LOG: CaptureLog = { note: [], todo: [], log: [] };

/** The timer shows seconds while it runs, so the page redraws once a second. */
const TICK_MS = 1000;

/** Pinned bookmarks the number keys reach: `1` to `9`. */
const PIN_KEYS = 9;

/** What the worker lists for each saved group of pinned tabs — the popup's view of them too. */
interface TabGroupSummary {
  id: string;
  name: string;
  tabCount: number;
}

const plural = (count: number) => `${count} tab${count === 1 ? '' : 's'}`;

const isMac = () => navigator.userAgent.includes('Mac');

const ENVIRONMENT_TAG: Record<Environment, string> = {
  DEV: 'border-nt-dev text-nt-dev',
  INT: 'border-nt-int text-nt-int',
  PROD: 'border-nt-prod text-nt-prod',
};

/** Keys typed into a field are text, not shortcuts — in the palette's shadow root too. */
const isTextField = (target: EventTarget | undefined): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

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
 * The page Chrome shows on a new tab: the bookmarks you reach for, the repo's day at a glance, a
 * capture box, and the palette.
 *
 * Chrome keeps the focus in the address bar on an override page, so nothing here is autofocused and
 * the palette is opened by the extension shortcut — relayed by the worker, exactly as on a normal
 * page — or by pressing Enter in the search field, which hands its text over.
 */
export function StartPage() {
  const [token, setToken] = useState<string | null>(null);
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
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
  const [capture, setCapture] = useState<CaptureKind>('note');
  const [captureLog, setCaptureLog] = useState<CaptureLog>(EMPTY_CAPTURE_LOG);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  // One commit at a time, as with the pins: two would race each other for the file's sha.
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [sync, setSync] = useState<{ syncedAt: number | null; pendingOpens: number }>({
    syncedAt: null,
    pendingOpens: 0,
  });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  // Built on first use, like the content script's, so a tab nobody searches from pays nothing.
  const paletteRef = useRef<CommandPalette | null>(null);
  const palette = () => {
    if (!paletteRef.current) {
      paletteRef.current = createCommandPalette({
        ...portHandlers(workerPort),
        // This tab is a blank start page, so a hit takes it over rather than leaving it behind.
        open: openInThisTab,
        actions: () => repoActions(workerPort),
        // The browser cannot run commands, so `>x` only copies them.
        modes: [...paletteModes(workerPort), commandsMode(workerPort, { canRun: false })],
        copy: copyToClipboard,
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

  const refreshSyncStatus = () =>
    send({ type: 'GET_SYNC_STATUS' }).then(
      (response) =>
        setSync({ syncedAt: response.syncedAt ?? null, pendingOpens: response.pendingOpens ?? 0 }),
      (e: Error) => console.warn('LifeOS Extension: could not read the sync status', e),
    );

  // Every read here is served from a cache the worker refreshes in the background when its hour
  // is up, so opening a tab costs no GitHub request.
  const loadAll = () => {
    const loads = [
      send({ type: 'GET_BOOKMARKS' }).then(
        (response) => setBookmarks(response.bookmarks),
        (e: Error) => setBookmarksError(e.message),
      ),
      refreshTabGroups(),
      send({ type: 'GET_TODAY' }).then(
        (response) => {
          setToday(response.today);
          setTodayError(null);
        },
        (e: Error) => setTodayError(e.message),
      ),
    ];
    // Asked last, so it reports on whatever the loads above just fetched.
    return Promise.all(loads).then(refreshSyncStatus);
  };

  useEffect(() => {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo', CAPTURE_LOG_KEY], (result) => {
      const storedToken = (result.lifeos_token as string) || null;
      setToken(storedToken);
      setRepo((result.lifeos_repo as string) || DEFAULT_REPO);
      setCaptureLog({ ...EMPTY_CAPTURE_LOG, ...(result[CAPTURE_LOG_KEY] as Partial<CaptureLog>) });
      if (storedToken) void loadAll();
    });
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
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

  // Numbered by the full list, so a pin keeps its key while the search hides others.
  const allPinned = bookmarks.filter((bookmark) => bookmark.pinned);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.composedPath()[0];
      if (isTextField(target)) {
        if (event.key === 'Escape' && target.getRootNode() === document) target.blur();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const pinned = /^[1-9]$/.test(event.key) ? allPinned[Number(event.key) - 1] : undefined;
      if (pinned) {
        event.preventDefault();
        openBookmark(pinned);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bookmarks]);

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

  const syncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await send({ type: 'SYNC_NOW', force: true });
      await loadAll();
    } catch (e: any) {
      setSyncError(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  /** Commits one tracker or read-later change; the worker answers with the updated summary. */
  const commitToday = async (busy: string, message: object) => {
    setBusyPath(busy);
    setTodayError(null);
    try {
      const response = await send(message);
      setToday(response.today);
    } catch (e: any) {
      setTodayError(e.message || 'Could not save that');
    } finally {
      setBusyPath(null);
    }
  };

  const openFile = (path: string) => openInThisTab(consoleFileUrl(path, repo));

  const captureTarget =
    capture === 'note'
      ? DUMP_PATH
      : capture === 'todo'
        ? (today?.inbox.path ?? 'inbox.todos.md')
        : (today?.actionLogPath ?? DEFAULT_ACTION_LOG_PATH);

  /** Remembers a saved capture for the list under the box, here and in every later tab. */
  const rememberCapture = (kind: CaptureKind, text: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const next = {
      ...captureLog,
      [kind]: [{ time, text }, ...captureLog[kind]].slice(0, CAPTURE_LOG_LIMIT),
    };
    setCaptureLog(next);
    chrome.storage.local
      .set({ [CAPTURE_LOG_KEY]: next })
      .catch((e: Error) => console.warn('LifeOS Extension: could not remember the capture', e));
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text || noteStatus === 'saving') return;
    const kind = capture;
    setNoteStatus('saving');
    setNoteError(null);
    try {
      if (kind === 'note') {
        await send({ type: 'DUMP_NOTE', path: DUMP_PATH, note });
      } else if (kind === 'todo') {
        const response = await send({ type: 'ADD_TODO', text: note });
        setToday(response.today);
      } else {
        // Without a summary yet the worker falls back on its own default log.
        await send({
          type: 'ADD_ACTION_LOG',
          path: today?.actionLogPath,
          description: note.replace(/#[\w-]+/g, '').trim(),
          tags: splitTags(note.match(/#[\w-]+/g)?.join(' ') ?? ''),
        });
      }
      setNote('');
      rememberCapture(kind, text);
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
      class="text-[24px] font-bold tracking-[-0.5px] text-nt-accent"
      title={`Open ${CONSOLE_URL}`}
    >
      kaihuman
    </a>
  );

  const root = 'min-h-screen bg-nt-bg text-nt-fg font-nt leading-[normal] antialiased';

  if (!token) {
    return (
      <div class={`${root} flex flex-col items-center justify-center gap-4 p-6`}>
        {title}
        <p class="text-[13px] text-nt-muted">Log in to the console to use this page.</p>
        <a
          href={CONSOLE_URL}
          class="px-4 py-2 bg-nt-primary text-black text-[13px] font-bold hover:bg-nt-accent"
        >
          Open Console
        </a>
      </div>
    );
  }

  const { pinned, recent } = startPageBookmarks(bookmarks, query);
  const pinKey = (bookmark: Bookmark) => allPinned.indexOf(bookmark) + 1;
  const noMatch = query.trim() !== '' && pinned.length === 0 && recent.length === 0;
  const error = (message: string) => <p class="text-[12px] text-nt-prod break-words">{message}</p>;

  const pinButton = (bookmark: Bookmark, place: string) => (
    <button
      type="button"
      onClick={() => void togglePin(bookmark)}
      disabled={pinning}
      aria-pressed={bookmark.pinned}
      aria-label={bookmark.pinned ? `Unpin ${bookmark.title}` : `Pin ${bookmark.title}`}
      title={bookmark.pinned ? 'Unpin' : 'Pin'}
      class={`absolute top-1/2 -translate-y-1/2 ${place} text-[12px] disabled:opacity-50 ${
        bookmark.pinned ? 'text-nt-accent hover:text-nt-fg' : 'text-nt-icon hover:text-nt-accent'
      }`}
    >
      {bookmark.pinned ? '●' : '○'}
    </button>
  );

  return (
    <div class={root}>
      <div class="mx-auto w-full max-w-[1240px] px-8 pt-8 pb-16 flex flex-col gap-7">
        <header class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-5 border-b border-nt-divider">
          <div class="flex flex-wrap items-baseline gap-x-7 gap-y-2">
            {title}
            <span class="text-[13px] text-nt-muted">{dateLine(now)}</span>
          </div>
          <div class="flex flex-wrap items-end gap-x-7 gap-y-3 min-w-0">
            {today && <Clocks clocks={today.clocks} now={now} />}
            <div class="flex flex-col items-end gap-0.5 min-w-0">
              <span class="text-[13px] text-nt-muted truncate max-w-full" title={repo}>
                {repo}
              </span>
              <SyncStatus
                syncedAt={sync.syncedAt}
                pendingOpens={sync.pendingOpens}
                syncing={syncing}
                error={syncError}
                now={now}
                onSync={() => void syncNow()}
              />
            </div>
          </div>
        </header>

        <div class="flex items-center gap-3 h-[52px] px-4 border border-nt-control focus-within:border-nt-accent">
          <span aria-hidden="true" class="text-[15px] text-nt-accent">
            &gt;
          </span>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              // What the bookmarks cannot answer goes to the palette: the repo, the web, actions.
              if (e.key === 'Enter') palette().open(query.trim());
            }}
            aria-label="Search"
            placeholder="Search bookmarks, the repo, the web, and every action…"
            class="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] placeholder:text-nt-faint"
          />
          <span class="hidden sm:flex gap-1.5 text-[11px] text-nt-muted">
            <kbd class="border border-nt-control px-1.5 py-0.5 font-nt">/</kbd>
            <kbd class="border border-nt-control px-1.5 py-0.5 font-nt">
              {isMac() ? '⌘⇧K' : 'Ctrl+Shift+K'}
            </kbd>
          </span>
        </div>

        {todayError && error(todayError)}

        <div class="flex flex-wrap items-start gap-10">
          <main class="flex-[2_1_560px] min-w-0 flex flex-col gap-8">
            <section class="flex flex-col gap-[10px]">
              <SectionHead
                title="Pinned"
                meta={
                  allPinned.length > 0 &&
                  `press ${allPinned.length === 1 ? '1' : `1–${Math.min(allPinned.length, PIN_KEYS)}`} to open`
                }
              />
              {pinError && error(pinError)}
              {allPinned.length === 0 ? (
                <p class="text-[13px] text-nt-faint">Nothing pinned yet — ○ on a link pins it.</p>
              ) : (
                <ul
                  aria-label="Pinned"
                  class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2"
                >
                  {pinned.map((bookmark) => {
                    const key = pinKey(bookmark);
                    return (
                      // The pin sits beside the card rather than inside it: a button cannot hold
                      // a button.
                      <li key={bookmark.id} class="group relative">
                        <button
                          type="button"
                          onClick={() => openBookmark(bookmark)}
                          class="w-full h-full flex items-center gap-3 border border-nt-pin p-[14px] pr-9 text-left group-hover:border-nt-accent group-hover:bg-nt-pin-hover"
                          title={bookmark.url}
                        >
                          <span
                            aria-hidden="true"
                            class="w-[22px] h-[22px] shrink-0 flex items-center justify-center border border-nt-accent text-[12px] text-nt-accent"
                          >
                            {key <= PIN_KEYS ? key : ''}
                          </span>
                          <span class="flex-1 min-w-0 flex flex-col gap-[3px]">
                            <span class="text-[14px] truncate">{bookmark.title}</span>
                            <span class="text-[11px] text-nt-muted truncate">
                              {hostOf(bookmark.url)}
                            </span>
                          </span>
                        </button>
                        {pinButton(bookmark, 'right-[14px]')}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section class="flex flex-col gap-[10px]">
              <SectionHead title="Tab groups" />
              {tabGroupsError && error(tabGroupsError)}
              {tabGroups.length === 0 ? (
                !tabGroupsError && (
                  <p class="text-[13px] text-nt-faint">
                    No tab groups yet — pin some tabs and save them from the popup.
                  </p>
                )
              ) : (
                <ul aria-label="Pinned tab groups" class="flex flex-wrap gap-2">
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
                          class={`flex items-baseline gap-[10px] border px-3 py-2 text-[14px] text-left hover:border-nt-accent disabled:opacity-50 ${
                            active ? 'border-nt-accent' : 'border-nt-control'
                          }`}
                        >
                          <span>{group.name}</span>
                          <span class="text-[11px] text-nt-muted">
                            {loadingGroupId === group.id ? 'Loading…' : plural(group.tabCount)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section class="flex flex-col gap-[10px]">
              <SectionHead title="Recently used" meta={`${recent.length} links`} />
              {bookmarksError ? (
                error(bookmarksError)
              ) : bookmarks.length === 0 ? (
                <p class="text-[13px] text-nt-faint">
                  No bookmarks yet — bookmark a page from the popup or the palette.
                </p>
              ) : (
                recent.length > 0 && (
                  <ul
                    aria-label="Recently used"
                    class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-6 border-t border-nt-divider"
                  >
                    {recent.map((bookmark) => {
                      const environment = bookmarkEnvironment(bookmark);
                      return (
                        <li key={bookmark.id} class="group relative border-b border-nt-row">
                          <button
                            type="button"
                            onClick={() => openBookmark(bookmark)}
                            class="w-full flex items-center gap-3 py-[10px] pl-1 pr-7 text-left group-hover:bg-nt-row-hover"
                            title={bookmark.url}
                          >
                            <span
                              class={`w-10 shrink-0 py-[2px] border text-center text-[10px] font-bold ${
                                environment
                                  ? ENVIRONMENT_TAG[environment]
                                  : 'border-nt-divider text-nt-divider'
                              }`}
                            >
                              {environment ?? '—'}
                            </span>
                            <span class="flex-1 min-w-0 flex flex-col gap-[2px]">
                              <span class="text-[13px] truncate">{bookmark.title}</span>
                              <span class="text-[11px] text-nt-muted truncate">
                                {hostOf(bookmark.url)}
                              </span>
                            </span>
                          </button>
                          {pinButton(bookmark, 'right-1')}
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
              {noMatch && (
                <p class="text-[13px] text-nt-muted px-1 py-2">
                  No bookmarks match. Enter searches the repo and the web.
                </p>
              )}
            </section>

            {today && (
              <ReadLater
                today={today}
                busyPath={busyPath}
                onOpenUrl={openInThisTab}
                onReadDone={(path, id) =>
                  void commitToday(`${path}#${id}`, { type: 'READ_LATER_DONE', path, id })
                }
              />
            )}
          </main>

          <aside class="flex-[1_1_320px] min-w-0 flex flex-col gap-6">
            {today && (
              <>
                <Doing
                  today={today}
                  now={now}
                  busyPath={busyPath}
                  onOpenFile={openFile}
                  onToggleTimer={(path) =>
                    void commitToday(path, { type: 'TODAY_TOGGLE_TIMER', path })
                  }
                />
                <ComingUp today={today} onOpenFile={openFile} />
                <Trackers
                  today={today}
                  busyPath={busyPath}
                  onCheckIn={(path) => void commitToday(path, { type: 'TODAY_CHECK_IN', path })}
                />
              </>
            )}

            <section class="flex flex-col gap-[10px]">
              <div class="flex items-baseline justify-between gap-4">
                <fieldset class="flex gap-[14px]">
                  <legend class="sr-only">Capture as</legend>
                  {(Object.keys(CAPTURE) as CaptureKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        setCapture(kind);
                        // "Added!" belongs to the last target, not the one just picked.
                        setNoteStatus('idle');
                      }}
                      aria-pressed={capture === kind}
                      class={`text-[12px] tracking-[1.5px] uppercase ${
                        capture === kind ? 'text-nt-accent' : 'text-nt-muted hover:text-nt-fg'
                      }`}
                    >
                      {CAPTURE[kind].label}
                    </button>
                  ))}
                </fieldset>
                <span class="text-[11px] text-nt-faint truncate" title={`${repo}/${captureTarget}`}>
                  {captureTarget}
                </span>
              </div>
              <textarea
                value={note}
                onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void addNote();
                  }
                }}
                aria-label={`${CAPTURE[capture].label} text`}
                class="h-24 resize-y bg-transparent border border-nt-control px-3 py-[10px] text-[13px] outline-none focus:border-nt-accent placeholder:text-nt-faint"
                placeholder={CAPTURE[capture].placeholder}
              />
              {noteStatus === 'error' && noteError && error(noteError)}
              <div class="flex items-center justify-between gap-4">
                <span class="text-[11px] text-nt-faint">
                  {isMac() ? '⌘+Enter' : 'Ctrl+Enter'} to save
                </span>
                <button
                  type="button"
                  onClick={() => void addNote()}
                  disabled={noteStatus === 'saving'}
                  class="px-4 py-2 bg-nt-primary text-black text-[13px] font-bold hover:bg-nt-accent disabled:opacity-50"
                >
                  {noteStatus === 'saving'
                    ? 'Saving…'
                    : noteStatus === 'success'
                      ? 'Added!'
                      : CAPTURE[capture].submit}
                </button>
              </div>
              {captureLog[capture].length > 0 && (
                <ul aria-label="Latest captures" class="flex flex-col">
                  {captureLog[capture].map((entry) => (
                    <li
                      key={`${entry.time}:${entry.text}`}
                      class="flex gap-[10px] py-1.5 border-b border-nt-row text-[12px]"
                    >
                      <span class="shrink-0 text-nt-faint tabular-nums">{entry.time}</span>
                      <span class="min-w-0 break-words text-pretty">{entry.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
