export interface Message {
  id: number;
  session_name: string;
  message_id: string;
  chat_id: string;
  from_me: boolean;
  sender: string;
  body: string;
  type: MessageType;
  timestamp: number;
  ack: number;
  is_read: boolean;
  created_at: string;
}

export enum MessageType {
  TEXT = 'chat',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT = 'vcard',
}

export interface CreateMessageDTO {
  sessionName: string;
  messageId: string;
  chatId: string;
  fromMe: boolean;
  sender: string;
  body: string;
  type: MessageType;
  timestamp: number;
  ack?: number;
}

export interface SendMessageDTO {
  to: string;
  message: string;
}

export interface SendFileDTO {
  to: string;
  caption?: string;
}

export interface MessageQuery {
  page?: number;
  limit?: number;
  chatId?: string;
  fromMe?: boolean;
}

export interface PaginatedMessages {
  messages: Message[];
  total: number;
}