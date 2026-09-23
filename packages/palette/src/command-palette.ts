/**
 * The command palette the keyboard shortcut opens in the page.
 *
 * Bookmarks are searched locally against the cached list, so typing costs nothing. The repo search
 * hits GitHub's code-search endpoint, which has a small dedicated budget, so it runs only when the
 * user presses Tab — never while typing. Any query can also be sent to a web search engine, which is
 * only a matter of opening its results page. Everything the popup can do is also here, as an action.
 */
import { type Bookmark, searchBookmarks } from './bookmarks.js';
import { SEARCH_ENGINES } from './web-search.js';

export interface RepoResult {
  path: string;
  name: string;
  url: string;
}

/** One field an action collects before it runs. */
export interface PromptStep {
  /** Shown as the input's placeholder, and named in the breadcrumb. */
  label: string;
  /** Prefilled and editable — a field the user usually keeps but sometimes corrects. */
  initial?: () => string;
}

/**
 * Something the palette can do. An action either opens a submenu (`children`), walks the user
 * through `prompts` first, or just runs — resolving with the line to show afterwards.
 */
export interface PaletteAction {
  id: string;
  title: string;
  subtitle?: string;
  /** Collected in order before `run`, which receives the values in the same order. */
  prompts?: PromptStep[];
  children?: () => Promise<PaletteAction[]>;
  run?: (inputs: string[]) => Promise<string>;
}

/** What the palette last did, so it can be repeated from the top of the list. */
export interface RecentEntry {
  id: string;
  title: string;
  subtitle?: string;
  /** Set for anything that was opened; actions are replayed by `id` instead. */
  url?: string;
}

export interface PaletteHandlers {
  loadBookmarks: () => Promise<Bookmark[]>;
  searchRepo: (query: string) => Promise<RepoResult[]>;
  open: (url: string) => void;
  actions: () => PaletteAction[];
  loadRecents: () => Promise<RecentEntry[]>;
  rememberRecent: (entry: RecentEntry) => void;
  /** Counts one open of a bookmark, so unused ones can be found later. */
  countBookmarkUse: (id: string) => void;
}

export interface PaletteOptions {
  /**
   * `top` (the default) hangs the panel below the top edge, like a browser's own palettes;
   * `center` centers a fixed-height panel, for a desktop overlay that should not jump as it filters.
   */
  placement?: 'top' | 'center';
  /** Runs whenever the palette closes — Esc, a click outside, or after opening something. */
  onClose?: () => void;
}

export interface CommandPalette {
  /** Opens the palette, or only refocuses its input if it is already open. */
  open: () => void;
  toggle: () => void;
  close: () => void;
  destroy: () => void;
}

interface Row {
  title: string;
  subtitle: string;
  activate: () => void;
}

export const PALETTE_HOST_ID = 'lifosy-command-palette';

// Inside a shadow root, so only inherited properties (font, colour) can leak in from the page —
// hence the explicit values on the container.
const STYLES = `
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: rgba(0, 0, 0, 0.55);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    line-height: 1.4;
    color: #e6e6e6;
  }
  .panel {
    width: min(620px, 92vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: #0d0d0d;
    border: 1px solid #2a2a2a;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  }
  .backdrop[data-placement="center"] {
    align-items: center;
    padding-top: 0;
  }
  .backdrop[data-placement="center"] .panel {
    height: min(420px, 70vh);
  }
  .crumb {
    padding: 8px 16px 0;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7dd3a7;
  }
  .crumb[hidden] { display: none; }
  input {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    padding: 14px 16px;
    font: inherit;
    color: #f5f5f5;
    border-bottom: 1px solid #2a2a2a;
  }
  input::placeholder { color: #6b6b6b; }
  .status {
    padding: 6px 16px;
    font-size: 11px;
    color: #8a8a8a;
    border-bottom: 1px solid #1c1c1c;
  }
  .status[hidden] { display: none; }
  .rows { overflow-y: auto; }
  .group {
    padding: 8px 16px 4px;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b6b6b;
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px;
    cursor: pointer;
    border-left: 2px solid transparent;
  }
  .row[data-selected="true"] {
    background: #171717;
    border-left-color: #7dd3a7;
  }
  .row .title { color: #f5f5f5; }
  .row .subtitle {
    font-size: 11px;
    color: #8a8a8a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty { padding: 16px; color: #6b6b6b; }
  .hint {
    padding: 8px 16px;
    font-size: 11px;
    color: #8a8a8a;
    border-top: 1px solid #1c1c1c;
  }
`;

const matches = (text: string, needle: string) => text.toLowerCase().includes(needle);

export function createCommandPalette(
  handlers: PaletteHandlers,
  options: PaletteOptions = {},
): CommandPalette {
  const host = document.createElement('div');
  host.id = PALETTE_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.dataset.placement = options.placement ?? 'top';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const crumb = document.createElement('div');
  crumb.className = 'crumb';
  crumb.hidden = true;
  const input = document.createElement('input');
  input.type = 'text';
  const status = document.createElement('div');
  status.className = 'status';
  status.hidden = true;
  const rows = document.createElement('div');
  rows.className = 'rows';
  const hint = document.createElement('div');
  hint.className = 'hint';

  panel.append(crumb, input, status, rows, hint);
  backdrop.append(panel);
  shadow.append(style, backdrop);

  let open = false;
  let bookmarks: Bookmark[] = [];
  let recents: RecentEntry[] = [];
  let repoResults: RepoResult[] | null = null;
  let repoQuery = '';
  let selected = 0;
  /** Guards against a slow repo search landing after the query moved on. */
  let searchToken = 0;
  /** Submenus the user has opened, so Esc walks back out one level at a time. */
  let trail: { title: string; actions: PaletteAction[] }[] = [];
  /** The action being filled in, which step it is on, and what has been collected so far. */
  let pending: { action: PaletteAction; step: number; values: string[] } | null = null;

  const needle = () => input.value.trim().toLowerCase();

  const setStatus = (text: string | null) => {
    status.textContent = text ?? '';
    status.hidden = !text;
  };

  const runAction = async (action: PaletteAction, inputs: string[]) => {
    setStatus(`${action.title}…`);
    try {
      setStatus((await action.run?.(inputs)) ?? null);
      handlers.rememberRecent({ id: action.id, title: action.title, subtitle: action.subtitle });
      // The action may have changed what the list should show (a new bookmark, say).
      bookmarks = await handlers.loadBookmarks().catch(() => bookmarks);
      recents = await handlers.loadRecents().catch(() => recents);
    } catch (e: any) {
      setStatus(e?.message || `${action.title} failed`);
    }
    render();
  };

  /** Moves the input to a step, prefilling whatever that step starts from. */
  const enterStep = (action: PaletteAction, step: number, values: string[]) => {
    pending = { action, step, values };
    input.value = action.prompts?.[step]?.initial?.() ?? '';
    // Selecting it means the prefill can be replaced by typing, or kept by pressing Enter.
    input.select();
    selected = 0;
    render();
  };

  /** Submenu, then prompts, then run — an action does exactly one of the three. */
  const activate = async (action: PaletteAction) => {
    if (action.children) {
      setStatus(null);
      let children: PaletteAction[];
      try {
        children = await action.children();
      } catch (e: any) {
        setStatus(e?.message || `${action.title} failed`);
        render();
        return;
      }
      trail = [...trail, { title: action.title, actions: children }];
      input.value = '';
      selected = 0;
      render();
      return;
    }
    if (action.prompts?.length && !pending) {
      setStatus(null);
      enterStep(action, 0, []);
      return;
    }
    if (!pending) {
      selected = 0;
      await runAction(action, []);
      return;
    }

    // Mid-walk: keep this answer and move on, or run once the last one is in.
    const values = [...pending.values, input.value.trim()];
    const next = pending.step + 1;
    if (next < (pending.action.prompts?.length ?? 0)) {
      enterStep(pending.action, next, values);
      return;
    }
    const { action: finished } = pending;
    pending = null;
    input.value = '';
    selected = 0;
    await runAction(finished, values);
  };

  const openUrl = (entry: RecentEntry) => {
    handlers.rememberRecent(entry);
    if (entry.url) handlers.open(entry.url);
    close();
  };

  const actionRow = (action: PaletteAction): Row => ({
    title: action.title,
    subtitle: action.subtitle ?? '',
    activate: () => void activate(action),
  });

  const recentRows = (): Row[] => {
    if (trail.length > 0) return [];
    return recents
      .filter((entry) => matches(entry.title, needle()) || matches(entry.subtitle ?? '', needle()))
      .map((entry) => ({
        title: entry.title,
        subtitle: entry.subtitle ?? '',
        activate: () => {
          if (entry.url) {
            openUrl(entry);
            return;
          }
          // An action is replayed by id, so a recent survives the action list being rebuilt.
          const action = handlers.actions().find((candidate) => candidate.id === entry.id);
          if (action) void activate(action);
          else setStatus('That action is no longer available');
        },
      }));
  };

  const bookmarkRows = (): Row[] => {
    if (trail.length > 0) return [];
    return searchBookmarks(bookmarks, input.value).map((bookmark) => ({
      title: bookmark.title,
      subtitle: bookmark.tags.length
        ? `${bookmark.url}  ${bookmark.tags.map((tag) => `#${tag}`).join(' ')}`
        : bookmark.url,
      activate: () => {
        handlers.countBookmarkUse(bookmark.id);
        openUrl({
          id: `bookmark:${bookmark.id}`,
          title: bookmark.title,
          subtitle: bookmark.url,
          url: bookmark.url,
        });
      },
    }));
  };

  const repoRows = (): Row[] => {
    if (trail.length > 0) return [];
    return (repoResults ?? []).map((result) => ({
      title: result.name,
      subtitle: result.path,
      activate: () =>
        openUrl({
          id: `repo:${result.path}`,
          title: result.name,
          subtitle: result.path,
          url: result.url,
        }),
    }));
  };

  /** One row per engine for whatever is typed; opening one is opening its results page. */
  const webRows = (): Row[] => {
    const query = input.value.trim();
    if (trail.length > 0 || !query) return [];
    return SEARCH_ENGINES.map((engine) => ({
      title: `Search ${engine.name} for “${query}”`,
      subtitle: engine.url(query),
      activate: () =>
        openUrl({
          id: `web:${engine.id}:${query}`,
          title: `${engine.name}: ${query}`,
          subtitle: engine.url(query),
          url: engine.url(query),
        }),
    }));
  };

  /** In a submenu it is that menu's entries; at the top level, the actions that match. */
  const actionRows = (): Row[] => {
    const here = trail.at(-1);
    if (here) {
      return here.actions
        .filter(
          (action) => matches(action.title, needle()) || matches(action.subtitle ?? '', needle()),
        )
        .map(actionRow);
    }
    return handlers
      .actions()
      .filter((action) => !needle() || matches(action.title, needle()))
      .map(actionRow);
  };

  const allRows = (): Row[] =>
    pending
      ? []
      : [...recentRows(), ...bookmarkRows(), ...repoRows(), ...actionRows(), ...webRows()];

  const render = () => {
    const here = trail.at(-1);
    const step = pending?.action.prompts?.[pending.step];
    const steps = pending?.action.prompts?.length ?? 0;
    // While filling an action in, the crumb says which field and how far along it is.
    crumb.textContent = pending
      ? `${pending.action.title.replace(/…$/, '')} · ${step?.label ?? ''} (${pending.step + 1}/${steps})`
      : (here?.title ?? '');
    crumb.hidden = !pending && !here;
    // Submenu titles already end in an ellipsis, which would otherwise double up here.
    input.placeholder =
      step?.label ??
      (here ? `Search ${here.title.replace(/…$/, '')}…` : 'Search bookmarks or the web…');

    const recent = recentRows();
    const bookmarkMatches = bookmarkRows();
    const repoMatches = repoRows();
    const web = webRows();
    const actions = actionRows();
    const total = pending
      ? 0
      : recent.length + bookmarkMatches.length + repoMatches.length + web.length + actions.length;
    if (selected >= total) selected = Math.max(0, total - 1);

    rows.replaceChildren();

    let index = 0;
    const addGroup = (label: string, groupRows: Row[]) => {
      if (groupRows.length === 0) return;
      const heading = document.createElement('div');
      heading.className = 'group';
      heading.textContent = label;
      rows.append(heading);
      for (const row of groupRows) {
        const position = index++;
        const element = document.createElement('div');
        element.className = 'row';
        element.dataset.selected = String(position === selected);
        const title = document.createElement('div');
        title.className = 'title';
        // Titles come from the repo file and the page, so they are set as text, never as markup.
        title.textContent = row.title;
        const subtitle = document.createElement('div');
        subtitle.className = 'subtitle';
        subtitle.textContent = row.subtitle;
        element.append(title, subtitle);
        element.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(position);
        });
        rows.append(element);
      }
    };

    if (pending) {
      const note = document.createElement('div');
      note.className = 'empty';
      // What has been answered so far, so a long walk stays reviewable.
      note.textContent = pending.values.filter(Boolean).join('  ·  ') || pending.action.title;
      rows.append(note);
    } else {
      addGroup('Recent', recent);
      addGroup('Bookmarks', bookmarkMatches);
      addGroup('Repo', repoMatches);
      if (!here && bookmarkMatches.length + repoMatches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = bookmarks.length
          ? 'No bookmark matches.'
          : 'No bookmarks cached yet — open the console to sync.';
        rows.append(empty);
      }
      addGroup(here ? here.title : 'Actions', actions);
      // Last, so typing an action's name and pressing Enter runs it; with nothing else matching,
      // the first row is a web search.
      addGroup('Web', web);
    }

    const query = input.value.trim();
    if (pending)
      hint.textContent = pending.step > 0 ? '⏎ next · esc back a field' : '⏎ next · esc cancel';
    else if (here) hint.textContent = '↑↓ navigate · ⏎ select · esc back';
    else if (!query) hint.textContent = '↑↓ navigate · ⏎ select · esc close';
    else if (repoResults && repoQuery === query) hint.textContent = '⏎ select · esc close';
    else hint.textContent = `⇥ tab search repo for “${query}” · ⏎ select · esc close`;
  };

  const choose = (position: number) => {
    allRows()[position]?.activate();
  };

  const runRepoSearch = async () => {
    if (pending || trail.length > 0) return;
    const query = input.value.trim();
    if (!query) return;
    const token = ++searchToken;
    setStatus(`Searching the repo for “${query}”…`);
    try {
      const results = await handlers.searchRepo(query);
      if (token !== searchToken) return;
      repoResults = results;
      repoQuery = query;
      setStatus(results.length ? null : `No repo matches for “${query}”`);
    } catch (e: any) {
      if (token !== searchToken) return;
      setStatus(e?.message || 'Repo search failed');
    }
    render();
  };

  /** Esc unwinds one step at a time: each field, then each submenu, then the palette. */
  const back = () => {
    if (pending) {
      // Walking back through the fields is how a typo two steps ago gets fixed.
      if (pending.step > 0) {
        const values = pending.values.slice(0, -1);
        const previous = pending.values.at(-1) ?? '';
        pending = { action: pending.action, step: pending.step - 1, values };
        input.value = previous;
        input.select();
        render();
        return;
      }
      pending = null;
      input.value = '';
      selected = 0;
      render();
      return;
    }
    if (trail.length > 0) {
      trail = trail.slice(0, -1);
      input.value = '';
      selected = 0;
      render();
      return;
    }
    close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      back();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const total = allRows().length;
      if (total === 0) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + total) % total;
      render();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      runRepoSearch();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (pending) void activate(pending.action);
      else choose(selected);
    }
  };

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('input', () => {
    // Results from the previous query would be misleading next to new bookmark matches.
    repoResults = null;
    repoQuery = '';
    searchToken++;
    selected = 0;
    setStatus(null);
    render();
  });
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });

  function close() {
    const wasOpen = open;
    open = false;
    host.remove();
    if (wasOpen) options.onClose?.();
  }

  const show = async () => {
    open = true;
    if (!host.isConnected) document.body.append(host);
    input.value = '';
    repoResults = null;
    repoQuery = '';
    trail = [];
    pending = null;
    selected = 0;
    setStatus(null);
    render();
    input.focus();

    const [loadedBookmarks, loadedRecents] = await Promise.all([
      handlers.loadBookmarks().catch((e: any) => {
        setStatus(e?.message || 'Could not load bookmarks');
        return [] as Bookmark[];
      }),
      handlers.loadRecents().catch(() => [] as RecentEntry[]),
    ]);
    bookmarks = loadedBookmarks;
    recents = loadedRecents;
    if (open) render();
  };

  return {
    open: () => {
      if (open) input.focus();
      else void show();
    },
    toggle: () => {
      if (open) close();
      else void show();
    },
    close,
    destroy: () => {
      close();
      input.removeEventListener('keydown', onKeyDown);
    },
  };
}
