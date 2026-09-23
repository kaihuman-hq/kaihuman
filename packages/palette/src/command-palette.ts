/**
 * The command palette the keyboard shortcut opens in the page.
 *
 * Bookmarks are searched locally against the cached list, so typing costs nothing. The repo search
 * hits GitHub's code-search endpoint, which has a small dedicated budget, so it runs only when the
 * user presses Tab — never while typing. Any query can also be sent to a web search engine, which is
 * only a matter of opening its results page. Everything the popup can do is also here, as an action.
 *
 * A short prefix switches the input into a mode with a list of its own — `p:` searches prompts,
 * `t:` translates — which Esc (or Backspace on an empty input) leaves again.
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

/** One entry a mode lists. Choosing it opens `url`, or else copies `copy` to the clipboard. */
export interface ModeItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Searched along with the title and subtitle, but not shown — a prompt's body, say. */
  keywords?: string;
  url?: string;
  copy?: string;
  /** More entries about this one (a repository's issues, pull requests…), listed on ⇥ or →. */
  children?: ModeItem[];
}

/** A list of its own behind a prefix: typing `p:` enters the mode whose `prefix` is `p`. */
export type PaletteMode = {
  prefix: string;
  /** Named in the breadcrumb, and as the verb in the hint of a mode that submits. */
  title: string;
  placeholder: string;
} & (
  | {
      /** Everything the mode offers, loaded on entering it and filtered locally as you type. */
      load: () => Promise<ModeItem[]>;
    }
  | {
      /**
       * Asked on ⏎ with what is typed — for modes whose every answer costs a request. The palette
       * also offers it for any text typed outside the mode.
       */
      submit: (query: string) => Promise<ModeItem[]>;
    }
);

export interface PaletteHandlers {
  loadBookmarks: () => Promise<Bookmark[]>;
  searchRepo: (query: string) => Promise<RepoResult[]>;
  open: (url: string) => void;
  actions: () => PaletteAction[];
  loadRecents: () => Promise<RecentEntry[]>;
  rememberRecent: (entry: RecentEntry) => void;
  /** Counts one open of a bookmark, so unused ones can be found later. */
  countBookmarkUse: (id: string) => void;
  modes: readonly PaletteMode[];
  /** Puts text on the clipboard; rejects with a message to show if it cannot. */
  copy: (text: string) => Promise<void>;
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

/** Enough to scroll through; a prompt library of hundreds is found by typing, not scrolling. */
const MODE_ROW_LIMIT = 50;

/**
 * Every word of the query somewhere in the item, so `commit git` finds "Commit message #git".
 * Items whose title holds every word come first; otherwise the list keeps its own order.
 */
export function filterModeItems(items: readonly ModeItem[], query: string): ModeItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  const inTitle: ModeItem[] = [];
  const elsewhere: ModeItem[] = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    const text = `${title} ${item.subtitle ?? ''} ${item.keywords ?? ''}`.toLowerCase();
    if (words.every((word) => title.includes(word))) inTitle.push(item);
    else if (words.every((word) => text.includes(word))) elsewhere.push(item);
  }
  return [...inTitle, ...elsewhere];
}

/** `p: query` → the mode `p` and `query`, for any prefix a mode claims. */
const modePrefix = (value: string, modes: readonly PaletteMode[]) => {
  const match = /^(\w+):\s*/.exec(value);
  const mode = match && modes.find((candidate) => candidate.prefix === match[1]);
  return mode && match ? { mode, rest: value.slice(match[0].length) } : null;
};

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
  /**
   * The prefix mode the input is in and what it lists: `items` is null until they are loaded, or,
   * in a mode that submits, until ⏎ answers the query in `answered`. `parent` is the entry whose
   * children are shown.
   */
  let mode: {
    mode: PaletteMode;
    items: ModeItem[] | null;
    answered: string;
    parent: ModeItem | null;
  } | null = null;
  /** Guards against a slow submit landing after the query moved on, like `searchToken`. */
  let submitToken = 0;

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

  /** Loads a listing mode's entries, unless the user has left the mode by the time they arrive. */
  const loadMode = async (entered: NonNullable<typeof mode>, load: () => Promise<ModeItem[]>) => {
    setStatus(`Loading ${entered.mode.title.toLowerCase()}…`);
    try {
      const items = await load();
      if (mode !== entered) return;
      entered.items = items;
      setStatus(null);
    } catch (e: any) {
      if (mode !== entered) return;
      setStatus(e?.message || `Could not load ${entered.mode.title.toLowerCase()}`);
    }
    render();
  };

  const submitMode = async () => {
    const current = mode;
    const query = input.value.trim();
    if (!current || !('submit' in current.mode) || !query) return;
    const token = ++submitToken;
    setStatus(`${current.mode.title}…`);
    try {
      const items = await current.mode.submit(query);
      if (token !== submitToken || mode !== current) return;
      current.items = items;
      current.answered = query;
      selected = 0;
      setStatus(items.length ? null : 'Nothing came back');
    } catch (e: any) {
      if (token !== submitToken || mode !== current) return;
      setStatus(e?.message || `${current.mode.title} failed`);
    }
    render();
  };

  /** Switches into `next` with `rest` in the input; a submitting mode given text submits it. */
  const enterMode = (next: PaletteMode, rest: string) => {
    mode = { mode: next, items: null, answered: '', parent: null };
    input.value = rest;
    trail = [];
    selected = 0;
    submitToken++;
    setStatus(null);
    render();
    if ('load' in next) void loadMode(mode, next.load);
    else if (rest.trim()) void submitMode();
  };

  /** What the mode lists right now: the parent's children, or its own entries, filtered. */
  const modeItems = (): ModeItem[] => {
    if (!mode) return [];
    if (mode.parent) return filterModeItems(mode.parent.children ?? [], input.value);
    if (!mode.items) return [];
    // A submitted answer is already for exactly what is typed; filtering it would hide it.
    return 'load' in mode.mode ? filterModeItems(mode.items, input.value) : mode.items;
  };

  const showChildren = (item: ModeItem | undefined) => {
    if (!mode || !item?.children?.length) return false;
    mode.parent = item;
    input.value = '';
    selected = 0;
    render();
    return true;
  };

  const chooseItem = async (item: ModeItem) => {
    if (item.url) {
      openUrl({ id: item.id, title: item.title, subtitle: item.subtitle, url: item.url });
      return;
    }
    if (item.copy !== undefined) {
      try {
        await handlers.copy(item.copy);
        close();
      } catch (e: any) {
        setStatus(e?.message || 'Could not copy that');
        render();
      }
      return;
    }
    showChildren(item);
  };

  const modeRows = (): Row[] =>
    modeItems()
      .slice(0, MODE_ROW_LIMIT)
      .map((item) => ({
        title: item.title,
        subtitle: item.subtitle ?? '',
        activate: () => void chooseItem(item),
      }));

  /** Whatever is typed, offered to each mode that submits — "Translate “Guten Morgen”". */
  const submitOfferRows = (): Row[] => {
    const query = input.value.trim();
    if (trail.length > 0 || !query) return [];
    return handlers.modes
      .filter((candidate) => 'submit' in candidate)
      .map((candidate) => ({
        title: `${candidate.title} “${query}”`,
        subtitle: `or type ${candidate.prefix}: first`,
        activate: () => enterMode(candidate, query),
      }));
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

  const allRows = (): Row[] => {
    if (pending) return [];
    if (mode) return modeRows();
    return [
      ...recentRows(),
      ...bookmarkRows(),
      ...repoRows(),
      ...actionRows(),
      ...webRows(),
      ...submitOfferRows(),
    ];
  };

  const render = () => {
    const here = trail.at(-1);
    const step = pending?.action.prompts?.[pending.step];
    const steps = pending?.action.prompts?.length ?? 0;
    // While filling an action in, the crumb says which field and how far along it is.
    if (pending)
      crumb.textContent = `${pending.action.title.replace(/…$/, '')} · ${step?.label ?? ''} (${pending.step + 1}/${steps})`;
    else if (mode)
      crumb.textContent = mode.parent
        ? `${mode.mode.title} › ${mode.parent.title}`
        : mode.mode.title;
    else crumb.textContent = here?.title ?? '';
    crumb.hidden = !pending && !here && !mode;
    // Submenu titles already end in an ellipsis, which would otherwise double up here.
    if (step) input.placeholder = step.label;
    else if (mode)
      input.placeholder = mode.parent ? `Search ${mode.parent.title}…` : mode.mode.placeholder;
    else if (here) input.placeholder = `Search ${here.title.replace(/…$/, '')}…`;
    else input.placeholder = 'Search bookmarks or the web…';

    const recent = recentRows();
    const bookmarkMatches = bookmarkRows();
    const repoMatches = repoRows();
    const web = webRows();
    const offers = submitOfferRows();
    const actions = actionRows();
    const listed = modeRows();
    let total = 0;
    if (mode) total = listed.length;
    else if (!pending)
      total =
        recent.length +
        bookmarkMatches.length +
        repoMatches.length +
        web.length +
        offers.length +
        actions.length;
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
    const addNote = (text: string) => {
      const note = document.createElement('div');
      note.className = 'empty';
      note.textContent = text;
      rows.append(note);
    };

    if (pending) {
      // What has been answered so far, so a long walk stays reviewable.
      addNote(pending.values.filter(Boolean).join('  ·  ') || pending.action.title);
    } else if (mode) {
      addGroup(mode.parent?.title ?? mode.mode.title, listed);
      if (listed.length === 0 && (mode.items || mode.parent)) addNote('No matches.');
    } else {
      addGroup('Recent', recent);
      addGroup('Bookmarks', bookmarkMatches);
      addGroup('Repo', repoMatches);
      if (!here && bookmarkMatches.length + repoMatches.length === 0) {
        addNote(
          bookmarks.length
            ? 'No bookmark matches.'
            : 'No bookmarks cached yet — open the console to sync.',
        );
      }
      addGroup(here ? here.title : 'Actions', actions);
      // Last, so typing an action's name and pressing Enter runs it; with nothing else matching,
      // the first row is a web search.
      addGroup('Web', web);
      addGroup('Translate', offers);
    }

    const query = input.value.trim();
    const prefixes = handlers.modes
      .map((candidate) => `${candidate.prefix}: ${candidate.title.toLowerCase()}`)
      .join(' · ');
    if (pending)
      hint.textContent = pending.step > 0 ? '⏎ next · esc back a field' : '⏎ next · esc cancel';
    else if (mode) {
      const submits = 'submit' in mode.mode && !mode.parent;
      const unanswered = submits && (!mode.items || mode.answered !== query);
      const more = modeItems()[selected]?.children?.length ? ' · ⇥ more' : '';
      hint.textContent = unanswered
        ? `⏎ ${mode.mode.title.toLowerCase()} · esc back`
        : `↑↓ navigate · ⏎ select${more} · esc back`;
    } else if (here) hint.textContent = '↑↓ navigate · ⏎ select · esc back';
    else if (!query)
      hint.textContent = `↑↓ navigate · ⏎ select${prefixes ? ` · ${prefixes}` : ''} · esc close`;
    else if (repoResults && repoQuery === query) hint.textContent = '⏎ select · esc close';
    else hint.textContent = `⇥ tab search repo for “${query}” · ⏎ select · esc close`;
  };

  const choose = (position: number) => {
    allRows()[position]?.activate();
  };

  const runRepoSearch = async () => {
    if (pending || trail.length > 0 || mode) return;
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
    if (mode) {
      if (mode.parent) mode.parent = null;
      else mode = null;
      submitToken++;
      input.value = '';
      selected = 0;
      setStatus(null);
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
    if (mode && !input.value) {
      // Backspace on an empty input takes the mode off again, as if its prefix were plain text:
      // the prefix comes back, and one more Backspace starts eating it.
      if (e.key === 'Backspace' && !mode.parent) {
        e.preventDefault();
        const { prefix } = mode.mode;
        back();
        input.value = `${prefix}:`;
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && mode.parent) {
        e.preventDefault();
        back();
        return;
      }
    }
    const atEnd = input.selectionStart === input.value.length;
    if (e.key === 'Tab' || (e.key === 'ArrowRight' && mode && atEnd)) {
      if (mode) {
        if (showChildren(modeItems()[selected]) || e.key === 'Tab') e.preventDefault();
        return;
      }
      e.preventDefault();
      runRepoSearch();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (pending) void activate(pending.action);
      else if (
        mode &&
        'submit' in mode.mode &&
        !mode.parent &&
        mode.answered !== input.value.trim()
      )
        void submitMode();
      else choose(selected);
    }
  };

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('input', () => {
    const prefixed =
      !mode && !pending && trail.length === 0 && modePrefix(input.value, handlers.modes);
    if (prefixed) {
      enterMode(prefixed.mode, prefixed.rest);
      return;
    }
    if (mode) {
      // The space typed after the prefix (`p: `) belongs to the prefix, not the query.
      if (/^\s/.test(input.value)) input.value = input.value.trimStart();
      selected = 0;
      // A submitted answer belongs to the text it was asked for; an edit asks again on ⏎.
      if ('submit' in mode.mode && !mode.parent) {
        mode.items = null;
        mode.answered = '';
        submitToken++;
        setStatus(null);
      }
      render();
      return;
    }
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
    mode = null;
    submitToken++;
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
