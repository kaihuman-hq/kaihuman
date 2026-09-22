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
    | 'SYNC_NOW'
    | 'GET_RECENTS'
    | 'ADD_RECENT'
    | 'GET_REPOS'
    | 'SET_REPO'
    | 'SAVE_SELECTION'
    | 'SEARCH_REPO'
    | 'OPEN_URL'
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
  force?: boolean;
}

export interface MessageResponse {
  success: boolean;
}
