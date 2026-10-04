/**
 * What the shared palette asks of the app it runs in, and what it reads back.
 *
 * The browser extension answers these over `chrome.runtime` messaging, from its service worker; the
 * desktop app will answer the same request names from Rust. A request names its `type`, and the
 * response lists only the fields the palette reads — a backend may send more.
 */
import type { BraindumpId } from '@lifosy/formats';
import type { Bookmark } from './bookmarks.js';
import type { ClaudeUsage } from './claude-usage.js';
import type { RecentEntry, RepoResult } from './command-palette.js';
import type { Translation } from './translate.js';

type NoFields = Record<never, never>;

/** A saved group of pinned tabs as the palette lists it. */
export interface PinnedTabGroupSummary {
  id: string;
  name: string;
  createdAt: string;
  tabCount: number;
}

/** What `>w` lists: pull requests to review, what is assigned, and your PRs whose checks fail. */
export type GithubWorkFilter = 'review-requested' | 'assigned' | 'failing';

/**
 * The GitHub issue search behind each filter. The backends run them (the desktop's Rust mirrors
 * this table), so the palette can only ask for these, never for a search of its own.
 */
export const GITHUB_WORK_QUERIES: Record<GithubWorkFilter, string> = {
  'review-requested': 'is:open is:pr archived:false review-requested:@me',
  assigned: 'is:open archived:false assignee:@me',
  failing: 'is:open is:pr archived:false author:@me status:failure',
};

/** One issue or pull request from a `LIST_GITHUB_WORK` search. */
export interface GithubWorkItem {
  /** `owner/name`. */
  repo: string;
  number: number;
  title: string;
  url: string;
  pullRequest: boolean;
  /** ISO 8601. */
  updatedAt: string;
}

/** A file or folder `SEARCH_LOCAL_FILES` found. */
export interface LocalFileHit {
  /** Absolute. */
  path: string;
  folder: boolean;
  /** For a match in the contents: the first matching line, `12:text`. */
  line?: string;
}

/** A braindump as the desktop keeps it (doc/braindump.md); `synced` once GitHub has this text. */
export interface Braindump {
  id: BraindumpId;
  text: string;
  updatedAt: number;
  synced: boolean;
}

export interface PaletteProtocol {
  GET_BOOKMARKS: { request: NoFields; response: { bookmarks: Bookmark[] } };
  SEARCH_REPO: { request: { query: string }; response: { results: RepoResult[] } };
  GET_RECENTS: { request: NoFields; response: { recents: RecentEntry[] } };
  /** The ids last chosen in one prefix mode, newest first — see `withModeRecent`. */
  GET_MODE_RECENTS: { request: { prefix: string }; response: { ids: string[] } };
  ADD_MODE_RECENT: { request: { prefix: string; id: string }; response: { ids: string[] } };
  ADD_RECENT: { request: { entry: RecentEntry }; response: { recents: RecentEntry[] } };
  RECORD_BOOKMARK_USE: { request: { bookmarkId: string }; response: NoFields };
  /** The quick-note files the repo's dashboard config lists; none when it has no such config. */
  FETCH_QUICK_NOTES: { request: NoFields; response: { quickNotes?: string[] } };
  DUMP_NOTE: { request: { path: string; note: string }; response: NoFields };
  LIST_PINNED_TAB_GROUPS: {
    request: NoFields;
    response: { groups: PinnedTabGroupSummary[]; activeId: string | null };
  };
  LOAD_PINNED_TAB_GROUP: {
    request: { groupId: string };
    response: { opened: number; unpinned: number };
  };
  /** Updates `groupId`, or saves a new group called `name`. */
  SAVE_PINNED_TAB_GROUP: {
    request: { groupId: string } | { name: string };
    response: { count: number; name: string };
  };
  RENAME_PINNED_TAB_GROUP: {
    request: { groupId: string; name: string };
    response: { name: string };
  };
  MOVE_PINNED_TAB_GROUP: {
    request: { groupId: string; offset: -1 | 1 };
    response: { moved: boolean };
  };
  DELETE_PINNED_TAB_GROUP: { request: { groupId: string }; response: { name: string } };
  IMPORT_CHROME_BOOKMARKS: { request: NoFields; response: { imported: number; skipped: number } };
  GET_REPOS: { request: NoFields; response: { repo: string; repos: { full_name: string }[] } };
  SET_REPO: { request: { repo: string }; response: NoFields };
  /** `synced` is false when there is no token; `bookmarks` counts what the sync fetched. */
  SYNC_NOW: { request: { force: boolean }; response: { synced: boolean; bookmarks?: number } };
  /** `reuse` takes over the asking tab (a blank start page) instead of opening another. */
  OPEN_URL: { request: { url: string; reuse?: boolean }; response: NoFields };
  /** Every `.prompts.md` file in the repository, raw; the palette parses them itself. */
  LIST_PROMPT_FILES: {
    request: NoFields;
    response: { files: { path: string; content: string }[] };
  };
  /** Every `.commands.md` file in the repository, raw, as `LIST_PROMPT_FILES` lists prompts. */
  LIST_COMMAND_FILES: {
    request: NoFields;
    response: { files: { path: string; content: string }[] };
  };
  /**
   * Desktop only: runs a filled-in command with bash — in a ghostty window that stays open until a
   * key is pressed, or in the background with a notification when it ends.
   */
  RUN_COMMAND: {
    request: { command: string; where: 'terminal' | 'background' };
    response: NoFields;
  };
  /** One translation per target, through DeepL; fails when no API key is set. */
  TRANSLATE: {
    request: { text: string; targets: string[] };
    response: { translations: Translation[] };
  };
  /** The last texts translated, newest first — see `withTranslationText`. */
  GET_TRANSLATION_HISTORY: { request: NoFields; response: { texts: string[] } };
  ADD_TRANSLATION_HISTORY: { request: { text: string }; response: { texts: string[] } };
  /** Stores the DeepL API key where the backend keeps secrets; an empty key forgets it. */
  SET_TRANSLATION_KEY: { request: { key: string }; response: NoFields };
  /** Desktop only: the local dump files, most recently edited first. */
  LIST_DUMPS: {
    request: NoFields;
    response: { dumps: { id: string; text: string; updatedAt: number }[] };
  };
  /**
   * Desktop only: writes a dump, creating one when `id` is missing. Empty text deletes it, and
   * the response then has no `id`.
   */
  SAVE_DUMP: { request: { id?: string; text: string }; response: { id?: string } };
  /** Desktop only: writes the text to `path` (`~/` allowed), never over an existing file. */
  EXPORT_DUMP: { request: { path: string; text: string }; response: { path: string } };
  /** Desktop only: the active repo's braindumps kept on this machine, most recently edited first. */
  LIST_BRAINDUMPS: { request: NoFields; response: { braindumps: Braindump[] } };
  /**
   * Desktop only: saves on this machine at once, creating a braindump when `id` is missing; empty
   * text deletes it and the response has no `id`. GitHub follows on the next `SYNC_BRAINDUMPS`.
   */
  SAVE_BRAINDUMP: { request: { id?: BraindumpId; text: string }; response: { id?: BraindumpId } };
  /**
   * Desktop only: sends what changed here to GitHub, then takes what changed there. Rejects with
   * the first failure; what failed is kept and tried again on the next sync.
   */
  SYNC_BRAINDUMPS: { request: NoFields; response: { braindumps: Braindump[] } };
  /**
   * Desktop only: hides the palette and shows the braindump window with that braindump, or a new
   * one without `id`.
   */
  OPEN_BRAINDUMP: { request: { id?: BraindumpId }; response: NoFields };
  /**
   * Desktop only: files and folders under the home directory whose name holds `query`; with
   * `contents`, also files whose text does, after them. Hidden files and `node_modules` are left
   * out. Rejects when the search ran out of time without finding anything.
   */
  SEARCH_LOCAL_FILES: {
    request: { query: string; contents: boolean };
    response: { home: string; hits: LocalFileHit[] };
  };
  /**
   * Desktop only: opens a path `SEARCH_LOCAL_FILES` found — with its default app, or the folder it
   * is in in the file manager or a terminal.
   */
  OPEN_LOCAL_FILE: {
    request: { path: string; with: 'app' | 'file-manager' | 'terminal' };
    response: NoFields;
  };
  /** Desktop only: repositories for `>c`, most recently used first (omarchy's `eee` history). */
  LIST_CLAUDE_CODE_REPOS: { request: NoFields; response: { repos: string[] } };
  /**
   * Desktop only: Claude usage per configured account — the usage endpoint's answer, or why there
   * is none.
   */
  GET_CLAUDE_USAGE: {
    /**
     * `cached` answers from the last fetch alone — no accounts and no `fetchedAt` when there has
     * been none; otherwise the endpoint is asked, and a fetch with any usage in it is cached.
     */
    request: { cached?: boolean };
    response: {
      accounts: { name: string; usage?: ClaudeUsage; error?: string }[];
      /** When the answer was fetched, in ms since the epoch. */
      fetchedAt?: number;
    };
  };
  /**
   * The repository's files the palette can add entries to — those ending in one of
   * `ENTRY_SUFFIXES` — each with its console link, as `SEARCH_REPO` lists a hit.
   */
  LIST_ENTRY_FILES: { request: NoFields; response: { files: RepoResult[] } };
  /**
   * One of those files and the version read; a file not there yet reads as empty, with no `sha`.
   * Backends refuse any path that does not end in one of `ENTRY_SUFFIXES`.
   */
  READ_ENTRY_FILE: { request: { path: string }; response: { content: string; sha?: string } };
  /** Replaces the file over the version `sha` names, so a change made since the read fails. */
  WRITE_ENTRY_FILE: {
    request: { path: string; content: string; sha?: string };
    response: NoFields;
  };
  /**
   * The raw `PALETTE_SETTINGS_PATH` (`.kh/command-palette.settings.json`), null when the repository
   * has none; the palette parses it itself. A backend may answer from a cache.
   */
  GET_PALETTE_SETTINGS: { request: NoFields; response: { content: string | null } };
  /**
   * Open issues and pull requests that wait on the user — see `GITHUB_WORK_QUERIES` — most
   * recently updated first.
   */
  LIST_GITHUB_WORK: {
    request: { filter: GithubWorkFilter };
    response: { items: GithubWorkItem[] };
  };
  /**
   * Creates a knowledge capture (see `knowledgeNote`), never over an existing file, and answers
   * with its console link. Backends refuse any path `isKnowledgePath` does not allow.
   */
  CAPTURE_KNOWLEDGE: { request: { path: string; content: string }; response: { url: string } };
  /** GitHub repositories to open, most relevant first — the order is the backend's. */
  LIST_GITHUB_REPOS: {
    request: NoFields;
    response: { repos: { fullName: string; description?: string }[] };
  };
}

export type PaletteRequestType = keyof PaletteProtocol;

export type PaletteRequest<K extends PaletteRequestType> = {
  type: K;
} & PaletteProtocol[K]['request'];

export type PaletteResponse<K extends PaletteRequestType> = PaletteProtocol[K]['response'];

/** How the palette reaches its backend. A failed request rejects with the backend's message. */
export interface ActionPort {
  send<K extends PaletteRequestType>(request: PaletteRequest<K>): Promise<PaletteResponse<K>>;
}
