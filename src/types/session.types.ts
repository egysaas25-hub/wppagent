export interface Session {
  id: number;
  session_name: string;
  phone_number: string | null;
  status: SessionStatus;
  qr_code: string | null;
  token: string | null;
  token_iv: string | null;
  token_auth_tag: string | null;
  auto_reconnect: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SessionWithDecryptedToken extends Session {
  decrypted_token?: string | null;
}

export enum SessionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  QR_CODE = 'qr_code',
  ERROR = 'error',
}

export interface CreateSessionDTO {
  sessionName: string;
  createdBy: string;
  autoReconnect?: boolean;
}

export interface UpdateSessionDTO {
  auto_reconnect?: boolean;
}

export interface SessionStats {
  messages_sent: number;
  messages_received: number;
  total_contacts: number;
  total_conversations: number;
  open_conversations: number;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}