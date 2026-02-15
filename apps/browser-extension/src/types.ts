export interface Message {
  type: 'AUTH_TOKEN_UPDATE';
  token?: string;
}

export interface MessageResponse {
  success: boolean;
}
