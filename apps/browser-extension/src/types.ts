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
}

export interface MessageResponse {
  success: boolean;
}
