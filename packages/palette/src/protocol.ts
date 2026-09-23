/**
 * What the shared palette asks of the app it runs in, and what it reads back.
 *
 * The browser extension answers these over `chrome.runtime` messaging, from its service worker; the
 * desktop app will answer the same request names from Rust. A request names its `type`, and the
 * response lists only the fields the palette reads — a backend may send more.
 */
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

export interface PaletteProtocol {
  GET_BOOKMARKS: { request: NoFields; response: { bookmarks: Bookmark[] } };
  SEARCH_REPO: { request: { query: string }; response: { results: RepoResult[] } };
  GET_RECENTS: { request: NoFields; response: { recents: RecentEntry[] } };
  ADD_RECENT: { request: { entry: RecentEntry }; response: { recents: RecentEntry[] } };
  RECORD_BOOKMARK_USE: { request: { bookmarkId: string }; response: NoFields };
  /** The quick-note files the repo's dashboard config lists; none when it has no such config. */
  FETCH_QUICK_NOTES: { request: NoFields; response: { quickNotes?: string[] } };
  DUMP_NOTE: { request: { path: string; note: string }; response: NoFields };
  ADD_ACTION_LOG: {
    request: { path: string; description: string; tags: string[] };
    response: NoFields;
  };
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
  /** Desktop only: repositories for `>c`, most recently used first (omarchy's `eee` history). */
  LIST_CLAUDE_CODE_REPOS: { request: NoFields; response: { repos: string[] } };
  /**
   * Desktop only: Claude usage per configured account — the usage endpoint's answer, or why there
   * is none.
   */
  GET_CLAUDE_USAGE: {
    request: NoFields;
    response: { accounts: { name: string; usage?: ClaudeUsage; error?: string }[] };
  };
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
