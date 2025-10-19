import db from '../config/database';
import {
  Message,
  CreateMessageDTO,
  MessageQuery,
  PaginatedMessages
} from '../types';

class MessageModel {
  /**
   * Save a message
   */
  static create(messageData: CreateMessageDTO): Message {
    const {
      sessionName,
      messageId,
      chatId,
      fromMe,
      sender,
      body,
      type,
      timestamp,
      ack = 0,
    } = messageData;

    const result = db.prepare(`
      INSERT INTO messages (
        session_name, message_id, chat_id, from_me, 
        sender, body, type, timestamp, ack
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionName,
      messageId,
      chatId,
      fromMe ? 1 : 0,
      sender,
      body,
      type,
      timestamp,
      ack
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Find message by ID
   */
  static findById(id: number): Message | undefined {
    const message = db.prepare(`
      SELECT * FROM messages WHERE id = ?
    `).get(id) as any;

    if (message) {
      message.from_me = Boolean(message.from_me);
      message.is_read = Boolean(message.is_read);
    }

    return message as Message | undefined;
  }

  /**
   * Find message by message ID
   */
  static findByMessageId(messageId: string): Message | undefined {
    const message = db.prepare(`
      SELECT * FROM messages WHERE message_id = ?
    `).get(messageId) as any;

    if (message) {
      message.from_me = Boolean(message.from_me);
      message.is_read = Boolean(message.is_read);
    }

    return message as Message | undefined;
  }

  /**
   * Get messages for a session
   */
  static findBySession(sessionName: string, query: MessageQuery): PaginatedMessages {
    const { page = 1, limit = 50, chatId, fromMe } = query;
    const offset = (page - 1) * limit;
    
    let sql = 'SELECT * FROM messages WHERE session_name = ?';
    const params: any[] = [sessionName];

    if (chatId) {
      sql += ' AND chat_id = ?';
      params.push(chatId);
    }

    if (fromMe !== undefined) {
      sql += ' AND from_me = ?';
      params.push(fromMe ? 1 : 0);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const messages = db.prepare(sql).all(...params) as any[];

    // Convert integers to booleans
    messages.forEach(m => {
      m.from_me = Boolean(m.from_me);
      m.is_read = Boolean(m.is_read);
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM messages WHERE session_name = ?';
    const countParams: any[] = [sessionName];

    if (chatId) {
      countQuery += ' AND chat_id = ?';
      countParams.push(chatId);
    }

    if (fromMe !== undefined) {
      countQuery += ' AND from_me = ?';
      countParams.push(fromMe ? 1 : 0);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    return { messages: messages as Message[], total };
  }

  /**
   * Update message acknowledgment
   */
  static updateAck(messageId: string, ack: number): Message | undefined {
    db.prepare(`
      UPDATE messages
      SET ack = ?
      WHERE message_id = ?
    `).run(ack, messageId);

    return this.findByMessageId(messageId);
  }

  /**
   * Mark message as read
   */
  static markAsRead(messageId: string): Message | undefined {
    db.prepare(`
      UPDATE messages
      SET is_read = 1
      WHERE message_id = ?
    `).run(messageId);

    return this.findByMessageId(messageId);
  }

  /**
   * Get unread message count
   */
  static getUnreadCount(sessionName: string, chatId?: string): number {
    let query = `
      SELECT COUNT(*) as count 
      FROM messages 
      WHERE session_name = ? AND is_read = 0 AND from_me = 0
    `;
    const params: any[] = [sessionName];

    if (chatId) {
      query += ' AND chat_id = ?';
      params.push(chatId);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Search messages
   */
  static search(sessionName: string, searchTerm: string, options: { page?: number; limit?: number }): PaginatedMessages {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;
    
    const messages = db.prepare(`
      SELECT * FROM messages
      WHERE session_name = ? 
        AND (body LIKE ? OR sender LIKE ?)
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(sessionName, `%${searchTerm}%`, `%${searchTerm}%`, limit, offset) as any[];

    messages.forEach(m => {
      m.from_me = Boolean(m.from_me);
      m.is_read = Boolean(m.is_read);
    });

    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM messages
      WHERE session_name = ? 
        AND (body LIKE ? OR sender LIKE ?)
    `).get(sessionName, `%${searchTerm}%`, `%${searchTerm}%`) as { total: number };

    return { messages: messages as Message[], total };
  }
}

export default MessageModel;