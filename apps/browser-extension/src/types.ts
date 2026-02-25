export interface Message {
  type: 'AUTH_TOKEN_UPDATE' | 'ADD_ACTION_LOG';
  token?: string;
  path?: string;
  note?: string;
  description?: string;
  tags?: string[];
}

export interface MessageResponse {
  success: boolean;
}
