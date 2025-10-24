export enum SessionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  QR_CODE = 'qr_code',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface Session {
  id: number;
  session_name: string;
  phone_number?: string;
  status: SessionStatus;
  qr_code?: string;
  qr_code_iv?: string;
  qr_code_auth_tag?: string;
  token?: string;
  token_iv?: string;
  token_auth_tag?: string;
  auto_reconnect: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface SessionWithDecryptedToken extends Session {
  decrypted_token?: string | null;
}

export interface CreateSessionDTO {
  sessionName: string;
  createdBy: string;
  autoReconnect?: boolean;
  tenantId: string;
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