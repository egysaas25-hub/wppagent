import MessageModel from '../models/message.model';
import SessionModel from '../models/session.model';
import { NotFoundError } from '../utils/errors';
import logger from '../config/logger';
import {
  CreateMessageDTO,
  MessageQuery,
  PaginatedMessages,
  Message
} from '../types';

class MessageService {
  /**
   * Save a message
   */
  static save(messageData: CreateMessageDTO): Message {
    logger.info('Saving message', { 
      sessionName: messageData.sessionName,
      chatId: messageData.chatId 
    });

    const message = MessageModel.create(messageData);

    logger.info('Message saved successfully', { 
      messageId: message.message_id,
      id: message.id 
    });

    return message;
  }

  /**
   * Get messages for a session
   */
  static getMessages(sessionName: string, query: MessageQuery): PaginatedMessages {
    // Verify session exists
    const session = SessionModel.findByName(sessionName);
    if (!session) {
      throw new NotFoundError('Session');
    }

    return MessageModel.findBySession(sessionName, query);
  }

  /**
   * Get message by ID
   */
  static getById(messageId: string): Message {
    const message = MessageModel.findByMessageId(messageId);

    if (!message) {
      throw new NotFoundError('Message');
    }

    return message;
  }

  /**
   * Update message acknowledgment
   */
  static updateAck(messageId: string, ack: number): Message {
    logger.info('Updating message ack', { messageId, ack });

    const message = MessageModel.updateAck(messageId, ack);

    if (!message) {
      throw new NotFoundError('Message');
    }

    return message;
  }

  /**
   * Mark message as read
   */
  static markAsRead(messageId: string): Message {
    logger.info('Marking message as read', { messageId });

    const message = MessageModel.markAsRead(messageId);

    if (!message) {
      throw new NotFoundError('Message');
    }

    return message;
  }

  /**
   * Get unread count
   */
  static getUnreadCount(sessionName: string, chatId?: string): number {
    // Verify session exists
    const session = SessionModel.findByName(sessionName);
    if (!session) {
      throw new NotFoundError('Session');
    }

    return MessageModel.getUnreadCount(sessionName, chatId);
  }

  /**
   * Search messages
   */
  static search(
    sessionName: string, 
    searchTerm: string,
    options: { page?: number; limit?: number }
  ): PaginatedMessages {
    // Verify session exists
    const session = SessionModel.findByName(sessionName);
    if (!session) {
      throw new NotFoundError('Session');
    }

    return MessageModel.search(sessionName, searchTerm, options);
  }
}

export default MessageService;