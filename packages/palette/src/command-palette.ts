/**
 * The command palette the keyboard shortcut opens in the page.
 *
 * Bookmarks are searched locally against the cached list, so typing costs nothing. The repo search
 * hits GitHub's code-search endpoint, which has a small dedicated budget, so it runs only when the
 * user presses Tab — never while typing. Any query can also be sent to a web search engine, which is
 * only a matter of opening its results page. Everything the popup can do is also here, as an action.
 *
 * A short prefix switches the input into a mode with a list of its own — `>p` searches prompts,
 * `>t` translates, `>b` only bookmarks — which Esc (or Backspace on an empty input) leaves again.
 * `?` lists them all.
 */
import {
  buildLinkUrl,
  type CommandPaletteSettings,
  DEFAULT_PALETTE_SETTINGS,
  PALETTE_SETTINGS_PATH,
  type PaletteToolSetting,
} from '@lifosy/formats';
import { type Bookmark, searchBookmarks } from './bookmarks.js';
import { conversionItems } from './convert.js';

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
  /** Typed masked, like a password, and never listed among the answers so far. */
  secret?: boolean;
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
  /**
   * In place of `run`: the page the answers lead to. It is opened and remembered like a bookmark —
   * so Recent repeats it — and the palette closes. Throwing refuses the answers.
   */
  opens?: (inputs: string[]) => RecentEntry;
  /**
   * In place of `run`: the choices the answers lead to — run a filled-in command, or copy it —
   * listed like a mode's entries, where Esc leaves them.
   */
  choices?: (inputs: string[]) => ModeItem[];
  /** Closes the palette once `run` succeeds, for actions that hand over to another window. */
  closes?: boolean;
  /** `false` keeps it out of Recent — for actions built from answers, which Recent cannot replay. */
  recent?: false;
}

/** What the palette last did, so it can be repeated from the top of the list. */
export interface RecentEntry {
  id: string;
  title: string;
  subtitle?: string;
  /** Set for anything that was opened; actions are replayed by `id` instead. */
  url?: string;
}

/**
 * Text the palette opens in an editor of its own — a dump. It is saved as it is typed, one `save`
 * at a time, and only when it changed.
 */
export interface EditableText {
  /** Named in the breadcrumb. */
  title: string;
  text: string;
  save: (text: string) => Promise<void>;
  /** Offered on ⌃S: writes the text to a path the user types, and resolves with where it went. */
  saveAs?: { suggestedPath: () => string; save: (path: string, text: string) => Promise<string> };
}

/**
 * One entry a mode lists. Choosing it opens `edit` in the editor, else opens `url`, else copies
 * `copy` to the clipboard.
 */
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
  edit?: () => EditableText;
  /** Run as if picked from the actions — its prompts asked in the input first. */
  action?: PaletteAction;
  /** Anything else choosing it should do — the help's entries switch modes. */
  choose?: () => void;
  /** Choosing it loads the mode's entries again, then refreshes them — a rescan, say. */
  reloads?: true;
  /** Consecutive entries with the same group are listed under it as one heading. */
  group?: string;
  /** A coloured mark before the title — how fresh cached data is, say. */
  tone?: Tone;
}

export type Tone = 'good' | 'warn' | 'bad';

/** A list of its own behind a prefix: typing `>p` enters the mode whose `prefix` is `p`. */
export type PaletteMode = {
  prefix: string;
  /** Named in the breadcrumb, and as the verb in the hint of a mode that submits. */
  title: string;
  placeholder: string;
  /** What the mode is for and how to use it, as the help (`?`) lists it. */
  description: string;
  /** `false` lists no recently chosen entries at the top — for a mode that is a status view. */
  recents?: false;
} & (
  | {
      /** Everything the mode offers, loaded on entering it and filtered locally as you type. */
      load: () => Promise<ModeItem[]>;
      /**
       * Asked once `load` has answered: newer entries to replace them with — `load` answering from
       * a cache, this from the source — or null when there is nothing newer to fetch.
       */
      refresh?: () => Promise<ModeItem[]> | null;
    }
  | {
      /**
       * Asked on ⏎ with what is typed — for modes whose every answer costs a request. The palette
       * also offers it for any text typed outside the mode.
       */
      submit: (query: string) => Promise<ModeItem[]>;
      /** Earlier queries, newest first, listed while the input is empty; ⏎ submits one again. */
      history?: () => Promise<string[]>;
    }
  | {
      /** The one entry for what is typed, even nothing — a search page to open, say. */
      link: (query: string) => ModeItem;
    }
  | {
      /** The entries for what is typed, in order and unfiltered — one per AI assistant, say. */
      links: (query: string) => ModeItem[];
    }
);

export interface PaletteHandlers {
  loadBookmarks: () => Promise<Bookmark[]>;
  searchRepo: (query: string) => Promise<RepoResult[]>;
  /**
   * What else a repo hit offers besides opening it — adding a todo to a `.todos.md`, say. With
   * none, choosing the hit opens it straight away.
   */
  fileChoices?: (file: RepoResult) => ModeItem[];
  open: (url: string) => void;
  actions: () => PaletteAction[];
  loadRecents: () => Promise<RecentEntry[]>;
  rememberRecent: (entry: RecentEntry) => void;
  /** Counts one open of a bookmark, so unused ones can be found later. */
  countBookmarkUse: (id: string) => void;
  /**
   * The repository's search engines, AI assistants and link tools, loaded each time the palette
   * opens; until they are (or without this), the defaults.
   */
  loadSettings?: () => Promise<CommandPaletteSettings>;
  modes: readonly PaletteMode[];
  /** Puts text on the clipboard; rejects with a message to show if it cannot. */
  copy: (text: string) => Promise<void>;
  /** The ids last chosen in the mode behind `prefix`, newest first (`MODE_RECENTS_LIMIT`). */
  loadModeRecents?: (prefix: string) => Promise<string[]>;
  rememberModeRecent?: (prefix: string, id: string) => void;
}

/** How many recently chosen entries each prefix mode keeps. */
export const MODE_RECENTS_LIMIT = 10;

/** Newest first, each id once, capped — choosing an entry again moves it back to the top. */
export const withModeRecent = (ids: readonly string[], id: string): string[] =>
  id ? [id, ...ids.filter((candidate) => candidate !== id)].slice(0, MODE_RECENTS_LIMIT) : [...ids];

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
  /**
   * Opens the palette, or only refocuses its input if it is already open. A `query` is typed in
   * as if by hand, so a search box elsewhere on the page can hand its text over.
   */
  open: (query?: string) => void;
  toggle: () => void;
  close: () => void;
  destroy: () => void;
}

interface Row {
  title: string;
  subtitle: string;
  activate: () => void;
  tone?: Tone;
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
  .rows[hidden], input[hidden], .editor[hidden] { display: none; }
  .editor {
    all: unset;
    display: block;
    box-sizing: border-box;
    flex: 1;
    min-height: 240px;
    width: 100%;
    padding: 12px 16px;
    font: inherit;
    color: #f5f5f5;
    white-space: pre-wrap;
    overflow-y: auto;
    border-bottom: 1px solid #2a2a2a;
  }
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
  /* Kept, so the padding that lines up the usage meters survives; long titles still wrap. */
  .row .title { color: #f5f5f5; white-space: pre-wrap; }
  .row .subtitle {
    font-size: 11px;
    color: #8a8a8a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rows[data-wrap="true"] .subtitle { white-space: normal; }
  .row[data-tone] .title::before { content: "● "; }
  .row[data-tone="good"] .title::before { color: #7dd3a7; }
  .row[data-tone="warn"] .title::before { color: #e5c07b; }
  .row[data-tone="bad"] .title::before { color: #e06c75; }
  .empty { padding: 16px; color: #6b6b6b; }
  .hint {
    padding: 8px 16px;
    font-size: 11px;
    color: #8a8a8a;
    border-top: 1px solid #1c1c1c;
  }
`;

const matches = (text: string, needle: string) => text.toLowerCase().includes(needle);

/** Typed at the start of the input, opens the help. */
const HELP_PREFIX = '?';

/** What the help says about searching and keys, whatever the surface. */
const helpTopics = (engines: readonly { name: string }[]): [string, string][] => [
  ['Type to search', 'Bookmarks by title, tags and URL; recent items first, actions below them'],
  [
    '⇥  Search the repo',
    'One GitHub code search for what you typed, only when you press Tab; files open in the console, and ⏎ on a todo list, log or the like also offers to add an entry',
  ],
  [
    'Search the web',
    engines.length
      ? `Anything typed is offered to ${engines.map((engine) => engine.name).join(', ')} — ⏎ with nothing else matching searches the first`
      : `No search engines — add some in ${PALETTE_SETTINGS_PATH}`,
  ],
  ['↑ ↓  ⏎', 'Move through the list and choose; mouse clicks work too'],
  ['⇥ or →', 'Open the entries under the selected one — a repository’s pages, say'],
  ['Esc', 'Back one step: a field, a list, a mode — then close the palette'],
  ['Backspace on an empty input', 'Leaves the current mode and gives its prefix back'],
  [
    'Recent in a mode',
    `Each prefix lists the last ${MODE_RECENTS_LIMIT} entries you chose in it first, while nothing is typed`,
  ],
];

/** Typing pauses this long before the editor saves, so a paste or a burst of keys is one save. */
const EDITOR_SAVE_DELAY_MS = 400;

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

/** Typed before a mode's letter: `>p`. */
const MODE_MARK = '>';

/**
 * `>p query` → the mode `p` and `query`, for any prefix a mode claims. The prefix must end there,
 * so `>p` switches as soon as the letter is typed while `>prompt` stays plain text.
 */
/** Whether a longer prefix starts with `prefix` — `>l` while there is `>le` — so `>l` waits. */
const isShadowing = (prefix: string, modes: readonly PaletteMode[]) =>
  modes.some((candidate) => candidate.prefix !== prefix && candidate.prefix.startsWith(prefix));

/**
 * The mode typed at the start of the input: entered as soon as its prefix is typed, or — when a
 * longer prefix starts the same way (`>l` and `>le`) — once a space follows it.
 */
const modePrefix = (value: string, modes: readonly PaletteMode[]) => {
  const match = /^>(\w+)(\s+|$)/.exec(value);
  if (!match) return null;
  const [typed, prefix = '', space] = match;
  const mode = modes.find((candidate) => candidate.prefix === prefix);
  if (!mode || (!space && isShadowing(prefix, modes))) return null;
  return { mode, rest: value.slice(typed.length) };
};

/** A tool from the settings as a mode: `>l term` offers the one link built from `term`. */
export const toolMode = (tool: PaletteToolSetting): PaletteMode => ({
  prefix: tool.prefix,
  title: tool.name,
  placeholder: `${tool.description || tool.name} — ⏎ opens it`,
  description: tool.description || `Opens ${tool.name} with what is typed`,
  link: (term) => ({
    id: `tool:${tool.prefix}:${term}`,
    title: term ? `${tool.name} “${term}”` : tool.name,
    subtitle: tool.description ?? '',
    url: buildLinkUrl(tool, term),
  }),
});

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

  const editorArea = document.createElement('textarea');
  editorArea.className = 'editor';
  editorArea.spellcheck = false;
  editorArea.hidden = true;

  panel.append(crumb, input, status, editorArea, rows, hint);
  backdrop.append(panel);
  shadow.append(style, backdrop);

  let open = false;
  let settings: CommandPaletteSettings = DEFAULT_PALETTE_SETTINGS;
  let toolModes: PaletteMode[] = [];
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
   * children are shown. `history` is what a submitting mode answered before.
   */
  let mode: {
    mode: PaletteMode;
    items: ModeItem[] | null;
    answered: string;
    parent: ModeItem | null;
    history: string[];
    /** Ids (a link mode: queries) last chosen in the mode, newest first. */
    recents: string[];
  } | null = null;
  /** Guards against a slow submit landing after the query moved on, like `searchToken`. */
  let submitToken = 0;
  /**
   * The text open in the editor: `saved` is what was last handed to `save`, `savingAs` whether the
   * input is asking for a path.
   */
  let editor: { doc: EditableText; saved: string; savingAs: boolean } | null = null;
  /**
   * Every save, chained so they land in order — across editors too, since a dump can be reopened
   * while its last save is still on its way.
   */
  let saving: Promise<void> = Promise.resolve();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const needle = () => input.value.trim().toLowerCase();

  const setStatus = (text: string | null) => {
    status.textContent = text ?? '';
    status.hidden = !text;
  };

  const runAction = async (action: PaletteAction, inputs: string[]) => {
    if (action.opens) {
      let entry: RecentEntry;
      try {
        entry = action.opens(inputs);
      } catch (e: any) {
        setStatus(e?.message || `${action.title} failed`);
        render();
        return;
      }
      openUrl(entry);
      return;
    }
    if (action.choices) {
      const choices = action.choices(inputs);
      enterMode(
        {
          prefix: '',
          title: action.title,
          placeholder: 'Choose',
          description: '',
          load: async () => choices,
        },
        '',
      );
      return;
    }
    setStatus(`${action.title}…`);
    try {
      setStatus((await action.run?.(inputs)) ?? null);
      if (action.recent !== false) {
        handlers.rememberRecent({ id: action.id, title: action.title, subtitle: action.subtitle });
      }
      if (action.closes) {
        close();
        return;
      }
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
      void refreshMode(entered);
    } catch (e: any) {
      if (mode !== entered) return;
      setStatus(e?.message || `Could not load ${entered.mode.title.toLowerCase()}`);
    }
    render();
  };

  /** Swaps in what the mode's `refresh` brings, unless the user has left the mode meanwhile. */
  const refreshMode = async (entered: NonNullable<typeof mode>) => {
    const refreshing = 'load' in entered.mode ? entered.mode.refresh?.() : null;
    if (!refreshing) return;
    try {
      const items = await refreshing;
      if (mode !== entered) return;
      entered.items = items;
    } catch (e: any) {
      if (mode !== entered) return;
      setStatus(e?.message || `Could not refresh ${entered.mode.title.toLowerCase()}`);
    }
    render();
  };

  /** Whether the mode lists recently chosen entries: a real prefix, not the help or choices. */
  const keepsRecents = (candidate: PaletteMode) =>
    candidate !== helpMode && !!candidate.prefix && candidate.recents !== false;

  /** Reads the mode's recent entries; a failure only means there are none to show. */
  const loadModeRecents = async (entered: NonNullable<typeof mode>) => {
    if (!handlers.loadModeRecents || !keepsRecents(entered.mode)) return;
    const recents = await handlers
      .loadModeRecents(entered.mode.prefix)
      .catch(() => entered.recents);
    if (mode !== entered) return;
    entered.recents = recents;
    render();
  };

  /** Counts a choice in the mode: its id, or for a link mode the query that built it. */
  const rememberModeChoice = (item: ModeItem) => {
    if (!mode || !keepsRecents(mode.mode)) return;
    // A link mode's entry is built from the query; a recent one carries its query as its id.
    const key =
      'link' in mode.mode && !mode.recents.includes(item.id) ? input.value.trim() : item.id;
    mode.recents = withModeRecent(mode.recents, key);
    handlers.rememberModeRecent?.(mode.mode.prefix, key);
  };

  /** Reads a submitting mode's history; a failure only means there is none to show. */
  const loadHistory = async (entered: NonNullable<typeof mode>) => {
    if (!('submit' in entered.mode) || !entered.mode.history) return;
    const history = await entered.mode.history().catch(() => entered.history);
    if (mode !== entered) return;
    entered.history = history;
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
      void loadHistory(current);
    } catch (e: any) {
      if (token !== submitToken || mode !== current) return;
      setStatus(e?.message || `${current.mode.title} failed`);
    }
    render();
  };

  /** Switches into `next` with `rest` in the input; a submitting mode given text submits it. */
  const enterMode = (next: PaletteMode, rest: string) => {
    mode = { mode: next, items: null, answered: '', parent: null, history: [], recents: [] };
    input.value = rest;
    trail = [];
    selected = 0;
    submitToken++;
    setStatus(null);
    render();
    void loadModeRecents(mode);
    if ('load' in next) void loadMode(mode, next.load);
    else if ('submit' in next) {
      void loadHistory(mode);
      if (rest.trim()) void submitMode();
    }
  };

  /** A submitting mode with nothing typed and nothing answered lists what it answered before. */
  const showsHistory = () =>
    !!mode &&
    'submit' in mode.mode &&
    !mode.parent &&
    !mode.items &&
    !input.value.trim() &&
    mode.history.length > 0;

  const bookmarkItem = (bookmark: Bookmark): ModeItem => ({
    id: `bookmark:${bookmark.id}`,
    title: bookmark.title,
    subtitle: bookmarkSubtitle(bookmark),
    choose: () => openBookmark(bookmark),
  });

  /**
   * With nothing typed, the entries last chosen in the mode come first, under Recent — found among
   * everything the mode offers (a link mode builds them again from their queries).
   */
  const withRecents = (current: NonNullable<typeof mode>, items: ModeItem[]): ModeItem[] => {
    if (input.value.trim() || !current.recents.length) return items;
    let known: ModeItem[];
    if ('link' in current.mode) {
      const { link } = current.mode;
      known = current.recents.map((query) => ({ ...link(query), id: query }));
    } else if (current.mode === bookmarksMode) known = bookmarks.map(bookmarkItem);
    else known = (current.items ?? []).flatMap((item) => [item, ...(item.children ?? [])]);
    const byId = new Map(known.map((item) => [item.id, item]));
    const recent = current.recents.flatMap((id) => {
      const item = byId.get(id);
      return item ? [{ ...item, group: 'Recent' }] : [];
    });
    const ids = new Set(recent.map((item) => item.id));
    return [...recent, ...items.filter((item) => !ids.has(item.id))];
  };

  /** What the mode lists right now: the parent's children, or its own entries, filtered. */
  const modeItems = (): ModeItem[] => {
    if (!mode) return [];
    if (mode.parent) return filterModeItems(mode.parent.children ?? [], input.value);
    if ('link' in mode.mode) return withRecents(mode, [mode.mode.link(input.value.trim())]);
    if ('links' in mode.mode) return mode.mode.links(input.value.trim());
    if (mode.mode === bookmarksMode) {
      return withRecents(
        mode,
        searchBookmarks(bookmarks, input.value, MODE_ROW_LIMIT).map(bookmarkItem),
      );
    }
    if (!mode.items) return [];
    // The help keeps its sections in order rather than ranking matches across them.
    if (mode.mode === helpMode)
      return mode.items.filter((item) => filterModeItems([item], input.value).length > 0);
    // A submitted answer is already for exactly what is typed; filtering it would hide it.
    return 'load' in mode.mode
      ? withRecents(mode, filterModeItems(mode.items, input.value))
      : mode.items;
  };

  const showChildren = (item: ModeItem | undefined) => {
    if (!mode || !item?.children?.length) return false;
    mode.parent = item;
    input.value = '';
    selected = 0;
    render();
    return true;
  };

  const copyAndClose = async (text: string) => {
    try {
      await handlers.copy(text);
      close();
    } catch (e: any) {
      setStatus(e?.message || 'Could not copy that');
      render();
    }
  };

  const chooseItem = async (item: ModeItem) => {
    // An entry that only lists more entries has not been used yet.
    if (item.choose || item.action || item.edit || item.url || item.copy !== undefined) {
      rememberModeChoice(item);
    }
    if (item.choose) {
      item.choose();
      return;
    }
    if (item.reloads && mode && 'load' in mode.mode) {
      input.value = '';
      selected = 0;
      void loadMode(mode, mode.mode.load);
      return;
    }
    if (item.action) {
      // The action takes over the input, so the mode steps aside for it.
      mode = null;
      input.value = '';
      selected = 0;
      void activate(item.action);
      render();
      return;
    }
    if (item.edit) {
      openEditor(item.edit());
      return;
    }
    if (item.url) {
      openUrl({ id: item.id, title: item.title, subtitle: item.subtitle, url: item.url });
      return;
    }
    if (item.copy !== undefined) {
      await copyAndClose(item.copy);
      return;
    }
    showChildren(item);
  };

  const modeRows = (): Row[] =>
    showsHistory()
      ? (mode?.history ?? []).map((text) => ({
          title: text,
          subtitle: `⏎ ${mode?.mode.title.toLowerCase()} again`,
          activate: () => {
            input.value = text;
            render();
            void submitMode();
          },
        }))
      : modeItems()
          .slice(0, MODE_ROW_LIMIT)
          .map((item) => ({
            title: item.title,
            subtitle: item.subtitle ?? '',
            activate: () => void chooseItem(item),
            tone: item.tone,
          }));

  /** Counts the open and remembers it, as a bookmark opened from anywhere in the palette is. */
  const openBookmark = (bookmark: Bookmark) => {
    handlers.countBookmarkUse(bookmark.id);
    openUrl({
      id: `bookmark:${bookmark.id}`,
      title: bookmark.title,
      subtitle: bookmark.url,
      url: bookmark.url,
    });
  };

  const bookmarkSubtitle = (bookmark: Bookmark) =>
    bookmark.tags.length
      ? `${bookmark.url}  ${bookmark.tags.map((tag) => `#${tag}`).join(' ')}`
      : bookmark.url;

  /** `>b`: the bookmarks alone, ranked as the main search ranks them (see `modeItems`). */
  const bookmarksMode: PaletteMode = {
    prefix: 'b',
    title: 'Bookmarks',
    placeholder: 'Search bookmarks only',
    description: 'Only your bookmarks, by title, tags and URL — without actions or web search',
    load: async () => [],
  };

  /**
   * `>a`: the question, offered to each assistant in the settings. Opening one also copies the
   * question, since some assistants (Gemini, Copilot) open an empty chat whatever the link says.
   */
  const assistantsMode: PaletteMode = {
    prefix: 'a',
    title: 'Ask AI',
    placeholder: 'Ask a question — ⏎ opens it in the assistant',
    description:
      'Opens a new chat with an AI assistant, the question filled in or on the clipboard',
    recents: false,
    links: (question) =>
      settings.assistants.map((assistant) => {
        const url = buildLinkUrl(assistant, question);
        return {
          id: `ai:${assistant.name.toLowerCase()}:${question}`,
          title: question ? `Ask ${assistant.name} “${question}”` : assistant.name,
          subtitle: url,
          choose: () => void askAssistant(assistant.name, question, url),
        };
      }),
  };

  const askAssistant = async (name: string, question: string, url: string) => {
    // A failed copy leaves the question in the link, where most assistants read it anyway.
    if (question) await handlers.copy(question).catch(() => undefined);
    openUrl({ id: `ai:${name.toLowerCase()}:${question}`, title: `${name}: ${question}`, url });
  };

  /** A tool whose prefix a mode of the palette or the surface claims is left out. */
  const applySettings = (next: CommandPaletteSettings) => {
    settings = next;
    const claimed = new Set(
      [bookmarksMode, assistantsMode, ...handlers.modes].map((candidate) => candidate.prefix),
    );
    toolModes = next.tools.filter((tool) => !claimed.has(tool.prefix)).map(toolMode);
  };
  applySettings(settings);

  /**
   * Every mode on this surface: the palette's own first, then the surface's, then `>a` (while
   * there are assistants), then the tools.
   */
  const allModes = () => [
    bookmarksMode,
    ...handlers.modes,
    ...(settings.assistants.length ? [assistantsMode] : []),
    ...toolModes,
  ];

  /**
   * `?`: everything the palette can do, for this surface — its prefixes, what searching does, the
   * keys and its actions. Built from `handlers`, so it never lists what is not there.
   */
  const helpItems = (): ModeItem[] => [
    ...allModes().map((candidate) => ({
      id: `help:mode:${candidate.prefix}`,
      title: `${MODE_MARK}${candidate.prefix}  ${candidate.title}`,
      subtitle: candidate.description,
      group: 'Prefixes — ⏎ switches to one',
      choose: () => enterMode(candidate, ''),
    })),
    ...helpTopics(settings.searchEngines).map(([title, subtitle], index) => ({
      id: `help:topic:${index}`,
      title,
      subtitle,
      group: 'Searching and keys',
    })),
    ...handlers.actions().map((action) => ({
      id: `help:action:${action.id}`,
      title: action.title,
      subtitle: action.subtitle,
      group: 'Actions — ⏎ runs one',
      action,
    })),
  ];

  const helpMode: PaletteMode = {
    prefix: HELP_PREFIX,
    title: 'Help',
    placeholder: 'Search the help',
    description: 'This list',
    load: async () => helpItems(),
  };

  /** How the mode's prefix is typed, so Backspace can give it back. */
  const typedPrefix = (candidate: PaletteMode) =>
    candidate === helpMode
      ? HELP_PREFIX
      : // An action's choices have no prefix to give back.
        candidate.prefix && `${MODE_MARK}${candidate.prefix}`;

  /** Whatever is typed, offered to each mode that submits — "Translate “Guten Morgen”". */
  const submitOfferRows = (): Row[] => {
    const query = input.value.trim();
    if (trail.length > 0 || !query) return [];
    return handlers.modes
      .filter((candidate) => 'submit' in candidate)
      .map((candidate) => ({
        title: `${candidate.title} “${query}”`,
        subtitle: `or type ${MODE_MARK}${candidate.prefix} first`,
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
      subtitle: bookmarkSubtitle(bookmark),
      activate: () => openBookmark(bookmark),
    }));
  };

  const repoRows = (): Row[] => {
    if (trail.length > 0) return [];
    return (repoResults ?? []).map((result) => ({
      title: result.name,
      subtitle: result.path,
      activate: () => {
        const choices = handlers.fileChoices?.(result) ?? [];
        if (choices.length) {
          void runAction(
            { id: `repo:${result.path}`, title: result.name, choices: () => choices },
            [],
          );
          return;
        }
        openUrl({
          id: `repo:${result.path}`,
          title: result.name,
          subtitle: result.path,
          url: result.url,
        });
      },
    }));
  };

  /** What is typed, converted — a color, `0x1f`, `12*7`, a timestamp; ⏎ copies the result. */
  const convertRows = (): Row[] => {
    if (trail.length > 0) return [];
    return conversionItems(input.value).map((item) => ({
      title: item.title,
      subtitle: item.subtitle ?? '',
      activate: () => void copyAndClose(item.copy ?? item.title),
    }));
  };

  /** One row per engine for whatever is typed; opening one is opening its results page. */
  const webRows = (): Row[] => {
    const query = input.value.trim();
    if (trail.length > 0 || !query) return [];
    return settings.searchEngines.map((engine) => {
      const url = buildLinkUrl(engine, query);
      return {
        title: `Search ${engine.name} for “${query}”`,
        subtitle: url,
        activate: () =>
          openUrl({
            id: `web:${engine.name.toLowerCase()}:${query}`,
            title: `${engine.name}: ${query}`,
            url,
            subtitle: url,
          }),
      };
    });
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
      ...convertRows(),
      ...webRows(),
      ...submitOfferRows(),
    ];
  };

  /** Saves what changed since the last save, after any save still running. */
  const flushEditor = () => {
    clearTimeout(saveTimer);
    const current = editor;
    if (!current) return saving;
    const text = editorArea.value;
    if (text !== current.saved) {
      current.saved = text;
      saving = saving
        .then(() => current.doc.save(text))
        .catch((e: any) => setStatus(e?.message || 'Could not save'));
    }
    return saving;
  };

  function openEditor(doc: EditableText) {
    editor = { doc, saved: doc.text, savingAs: false };
    editorArea.value = doc.text;
    setStatus(null);
    render();
    editorArea.focus();
    editorArea.setSelectionRange(doc.text.length, doc.text.length);
  }

  /** Back to the mode's list, which is loaded again so it shows what was just saved. */
  const closeEditor = () => {
    const saved = flushEditor();
    editor = null;
    input.value = '';
    selected = 0;
    render();
    input.focus();
    const current = mode;
    if (current && 'load' in current.mode) {
      const { load } = current.mode;
      void saved.then(() => loadMode(current, load));
    }
  };

  const onEditorKeyDown = (e: KeyboardEvent) => {
    if (!editor) return;
    const withModifier = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor();
    } else if (withModifier && e.key.toLowerCase() === 's' && editor.doc.saveAs) {
      e.preventDefault();
      editor.savingAs = true;
      input.value = editor.doc.saveAs.suggestedPath();
      render();
      input.focus();
      input.select();
    } else if (withModifier && e.key === 'Enter') {
      e.preventDefault();
      const text = editorArea.value;
      void handlers.copy(text).then(
        () => {
          void flushEditor();
          close();
        },
        (error: any) => {
          setStatus(error?.message || 'Could not copy that');
          render();
        },
      );
    }
  };

  /** The input, while the editor asks for a path to save to. */
  const onSaveAsKeyDown = (e: KeyboardEvent, current: NonNullable<typeof editor>) => {
    if (e.key !== 'Escape' && e.key !== 'Enter') return;
    e.preventDefault();
    const path = input.value.trim();
    current.savingAs = false;
    render();
    editorArea.focus();
    if (e.key === 'Escape' || !path || !current.doc.saveAs) return;
    setStatus(`Saving to ${path}…`);
    current.doc.saveAs.save(path, editorArea.value).then(
      (written) => setStatus(`Saved to ${written}`),
      (error: any) => setStatus(error?.message || `Could not save to ${path}`),
    );
  };

  const render = () => {
    editorArea.hidden = !editor;
    rows.hidden = !!editor;
    input.hidden = !!editor && !editor.savingAs;
    if (editor && mode) {
      crumb.hidden = false;
      crumb.textContent = `${mode.mode.title} › ${editor.doc.title}${editor.savingAs ? ' · Save as' : ''}`;
      input.placeholder = 'Path to save to';
      hint.textContent = editor.savingAs
        ? '⏎ save · esc back to the text'
        : `${editor.doc.saveAs ? '⌃S save as file · ' : ''}⌃⏎ copy all · esc back — saved as you type`;
      return;
    }

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
    input.type = step?.secret ? 'password' : 'text';
    // Submenu titles already end in an ellipsis, which would otherwise double up here.
    if (step) input.placeholder = step.label;
    else if (mode)
      input.placeholder = mode.parent ? `Search ${mode.parent.title}…` : mode.mode.placeholder;
    else if (here) input.placeholder = `Search ${here.title.replace(/…$/, '')}…`;
    else input.placeholder = 'Search bookmarks or the web…';

    const recent = recentRows();
    const bookmarkMatches = bookmarkRows();
    const repoMatches = repoRows();
    const converted = convertRows();
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
        converted.length +
        web.length +
        offers.length +
        actions.length;
    if (selected >= total) selected = Math.max(0, total - 1);

    rows.replaceChildren();
    // The help's descriptions are the point of it, so they wrap instead of being cut short.
    rows.dataset.wrap = String(mode?.mode === helpMode);

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
        if (row.tone) element.dataset.tone = row.tone;
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
      // Before any answer, the subtitle says what is being filled in — a command's `{{port}}`, say.
      addNote(
        pending.values
          .filter((value, index) => value && !pending?.action.prompts?.[index]?.secret)
          .join('  ·  ') ||
          pending.action.subtitle ||
          pending.action.title,
      );
    } else if (mode) {
      if (showsHistory()) addGroup('Recent', listed);
      else {
        // Entries that name a group are listed under it; the rest under the mode's own title.
        const label = (item: ModeItem | undefined) =>
          item?.group ?? mode?.parent?.title ?? mode?.mode.title ?? '';
        const items = modeItems();
        let start = 0;
        listed.forEach((_, index) => {
          if (index + 1 === listed.length || label(items[index + 1]) !== label(items[index])) {
            addGroup(label(items[start]), listed.slice(start, index + 1));
            start = index + 1;
          }
        });
      }
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
      // A conversion is what a sum or a color was typed for, so it comes before the web search.
      addGroup('Convert', converted);
      // Last, so typing an action's name and pressing Enter runs it; with nothing else matching,
      // the first row is a web search.
      addGroup('Web', web);
      addGroup('Translate', offers);
    }

    // Arrowing past the visible rows would otherwise leave the selection out of sight.
    rows.querySelector<HTMLElement>('.row[data-selected="true"]')?.scrollIntoView?.({
      block: 'nearest',
    });

    const query = input.value.trim();
    // A prefix typed in full that did not enter its mode waits for a space: a longer one shares it.
    const waitingPrefix = /^>(\w+)$/.exec(input.value)?.[1];
    const waiting = waitingPrefix
      ? allModes().find((candidate) => candidate.prefix === waitingPrefix)
      : undefined;
    // Letters only, to fit one line; `?` names what each one is.
    const prefixes = `${HELP_PREFIX} help · ${allModes()
      .map((candidate) => `${MODE_MARK}${candidate.prefix}`)
      .join(' ')}`;
    if (pending)
      hint.textContent = pending.step > 0 ? '⏎ next · esc back a field' : '⏎ next · esc cancel';
    else if (mode) {
      const submits = 'submit' in mode.mode && !mode.parent;
      const unanswered = submits && (!mode.items || mode.answered !== query);
      const more = modeItems()[selected]?.children?.length ? ' · ⇥ more' : '';
      if (showsHistory())
        hint.textContent = `↑↓ navigate · ⏎ ${mode.mode.title.toLowerCase()} again · esc back`;
      else if (unanswered) hint.textContent = `⏎ ${mode.mode.title.toLowerCase()} · esc back`;
      else hint.textContent = `↑↓ navigate · ⏎ select${more} · esc back`;
    } else if (here) hint.textContent = '↑↓ navigate · ⏎ select · esc back';
    else if (waiting)
      hint.textContent = `space enters ${MODE_MARK}${waiting.prefix} ${waiting.title} · or keep typing · esc close`;
    else if (!query) hint.textContent = `↑↓ navigate · ⏎ select · ${prefixes} · esc close`;
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
        const typed = typedPrefix(mode.mode);
        back();
        input.value = typed;
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
        input.value.trim() &&
        mode.answered !== input.value.trim()
      )
        void submitMode();
      else choose(selected);
    }
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    if (editor?.savingAs) onSaveAsKeyDown(e, editor);
    else onKeyDown(e);
  };
  input.addEventListener('keydown', onInputKeyDown);
  editorArea.addEventListener('keydown', onEditorKeyDown);
  editorArea.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushEditor(), EDITOR_SAVE_DELAY_MS);
  });
  input.addEventListener('input', () => {
    if (editor) return;
    const prefixed = !mode && !pending && trail.length === 0 && modePrefix(input.value, allModes());
    if (prefixed) {
      enterMode(prefixed.mode, prefixed.rest);
      return;
    }
    if (!mode && !pending && trail.length === 0 && input.value.startsWith(HELP_PREFIX)) {
      enterMode(helpMode, input.value.slice(HELP_PREFIX.length).trimStart());
      return;
    }
    if (mode) {
      // The space typed after the prefix (`>p `) belongs to the prefix, not the query.
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
    void flushEditor();
    editor = null;
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
    editor = null;
    submitToken++;
    selected = 0;
    setStatus(null);
    render();
    input.focus();

    const [loadedBookmarks, loadedRecents, loadedSettings] = await Promise.all([
      handlers.loadBookmarks().catch((e: any) => {
        setStatus(e?.message || 'Could not load bookmarks');
        return [] as Bookmark[];
      }),
      handlers.loadRecents().catch(() => [] as RecentEntry[]),
      handlers.loadSettings?.().catch((e: any) => {
        console.warn('LifeOS palette: could not load the settings', e);
        return settings;
      }),
    ]);
    bookmarks = loadedBookmarks;
    recents = loadedRecents;
    if (loadedSettings) applySettings(loadedSettings);
    if (open) render();
  };

  return {
    open: (query) => {
      if (open) input.focus();
      else void show();
      if (query) {
        input.value = query;
        // Through the input handler, so a typed mode prefix (`>t …`) switches mode as usual.
        input.dispatchEvent(new Event('input'));
      }
    },
    toggle: () => {
      if (open) close();
      else void show();
    },
    close,
    destroy: () => {
      close();
      input.removeEventListener('keydown', onInputKeyDown);
      editorArea.removeEventListener('keydown', onEditorKeyDown);
    },
  };
}
