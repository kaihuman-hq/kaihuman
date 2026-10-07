export interface Message {
  type:
    | 'AUTH_TOKEN_UPDATE'
    | 'ADD_ACTION_LOG'
    | 'LIST_PINNED_TAB_GROUPS'
    | 'LOAD_PINNED_TAB_GROUP'
    | 'SAVE_PINNED_TAB_GROUP'
    | 'RENAME_PINNED_TAB_GROUP'
    | 'MOVE_PINNED_TAB_GROUP'
    | 'FAVORITE_PINNED_TAB_GROUP'
    | 'DELETE_PINNED_TAB_GROUP'
    | 'GET_BOOKMARKS'
    | 'ADD_BOOKMARK'
    | 'IMPORT_CHROME_BOOKMARKS'
    | 'RECORD_BOOKMARK_USE'
    | 'SET_BOOKMARK_PINNED'
    | 'SYNC_NOW'
    | 'GET_RECENTS'
    | 'ADD_RECENT'
    | 'GET_MODE_RECENTS'
    | 'ADD_MODE_RECENT'
    | 'GET_REPOS'
    | 'SET_REPO'
    | 'SYNC_REPO_WITH_DESKTOP'
    | 'SAVE_SELECTION'
    | 'SEARCH_REPO'
    | 'OPEN_URL'
    | 'LIST_PROMPT_FILES'
    | 'LIST_COMMAND_FILES'
    | 'LIST_ENTRY_FILES'
    | 'READ_ENTRY_FILE'
    | 'WRITE_ENTRY_FILE'
    | 'TRANSLATE'
    | 'GET_TRANSLATION_HISTORY'
    | 'ADD_TRANSLATION_HISTORY'
    | 'SET_TRANSLATION_KEY'
    | 'LIST_GITHUB_REPOS'
    | 'LIST_GITHUB_WORK'
    | 'GET_PALETTE_SETTINGS'
    | 'TOGGLE_COMMAND_PALETTE'
    | 'GET_TODAY'
    | 'REFRESH_TODAY'
    | 'GET_SERVICE_STATUS'
    | 'DELETE_BRAINDUMP'
    | 'GET_SYNC_STATUS'
    | 'TODAY_CHECK_IN'
    | 'TODAY_TOGGLE_TIMER'
    | 'READ_LATER_DONE'
    | 'READ_LATER_ADD'
    | 'ADD_TODO';
  token?: string;
  path?: string;
  note?: string;
  description?: string;
  tags?: string[];
  query?: string;
  url?: string;
  title?: string;
  text?: string;
  repo?: string;
  entry?: { id: string; title: string; subtitle?: string; url?: string };
  bookmarkId?: string;
  /** `SET_BOOKMARK_PINNED`: the state to set, not a toggle, so a double click cannot undo itself. */
  pinned?: boolean;
  /** `FAVORITE_PINNED_TAB_GROUP`: the state to set, not a toggle, for the same reason. */
  favorite?: boolean;
  force?: boolean;
  /** `OPEN_URL`: navigate the sender's own tab rather than opening another one. */
  reuse?: boolean;
  /** `TRANSLATE`: the DeepL target languages. */
  targets?: string[];
  /** `SET_TRANSLATION_KEY`: the DeepL API key; empty forgets it. */
  key?: string;
  /** `READ_LATER_DONE`: the item to mark read; `ADD_MODE_RECENT`: the entry chosen. */
  id?: string;
  /** `GET_MODE_RECENTS`, `ADD_MODE_RECENT`: the palette mode's prefix (`p` for `>p`). */
  prefix?: string;
  /** `WRITE_ENTRY_FILE`: the file's new text. */
  content?: string;
  /** `WRITE_ENTRY_FILE`: the version the text was built on. */
  sha?: string;
  /** `LIST_GITHUB_WORK`: which search; checked, since it comes from the page. */
  filter?: string;
}

export interface MessageResponse {
  success: boolean;
}
