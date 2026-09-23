export interface Message {
  type:
    | 'AUTH_TOKEN_UPDATE'
    | 'ADD_ACTION_LOG'
    | 'LIST_PINNED_TAB_GROUPS'
    | 'LOAD_PINNED_TAB_GROUP'
    | 'SAVE_PINNED_TAB_GROUP'
    | 'RENAME_PINNED_TAB_GROUP'
    | 'MOVE_PINNED_TAB_GROUP'
    | 'DELETE_PINNED_TAB_GROUP'
    | 'GET_BOOKMARKS'
    | 'ADD_BOOKMARK'
    | 'IMPORT_CHROME_BOOKMARKS'
    | 'RECORD_BOOKMARK_USE'
    | 'SET_BOOKMARK_PINNED'
    | 'SYNC_NOW'
    | 'GET_RECENTS'
    | 'ADD_RECENT'
    | 'GET_REPOS'
    | 'SET_REPO'
    | 'SAVE_SELECTION'
    | 'SEARCH_REPO'
    | 'OPEN_URL'
    | 'LIST_PROMPT_FILES'
    | 'TRANSLATE'
    | 'GET_TRANSLATION_HISTORY'
    | 'ADD_TRANSLATION_HISTORY'
    | 'SET_TRANSLATION_KEY'
    | 'LIST_GITHUB_REPOS'
    | 'TOGGLE_COMMAND_PALETTE';
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
  force?: boolean;
  /** `OPEN_URL`: navigate the sender's own tab rather than opening another one. */
  reuse?: boolean;
  /** `TRANSLATE`: the DeepL target languages. */
  targets?: string[];
  /** `SET_TRANSLATION_KEY`: the DeepL API key; empty forgets it. */
  key?: string;
}

export interface MessageResponse {
  success: boolean;
}
