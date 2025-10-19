import db from '../config/database';

export interface Conversation {
  id: number;
  session_name: string;
  chat_id: string;
  last_message: string | null;
  last_message_time: number | null;
  unread_count: number;
  assigned_agent: string | null;
  tags: string | null;
  status: ConversationStatus;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export enum ConversationStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  PENDING = 'pending',
}

export interface CreateConversationDTO {
  sessionName: string;
  chatId: string;
  lastMessage?: string;
  lastMessageTime?: number;
}

class ConversationModel {
  /**
   * Create or update conversation
   */
  static upsert(data: CreateConversationDTO): Conversation {
    const { sessionName, chatId, lastMessage, lastMessageTime } = data;

    const existing = this.findByChatId(sessionName, chatId);

    if (existing) {
      // Update
      db.prepare(`
        UPDATE conversations
        SET 
          last_message = ?,
          last_message_time = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE session_name = ? AND chat_id = ?
      `).run(
        lastMessage || existing.last_message,
        lastMessageTime || existing.last_message_time,
        sessionName,
        chatId
      );
    } else {
      // Insert
      db.prepare(`
        INSERT INTO conversations (session_name, chat_id, last_message, last_message_time)
        VALUES (?, ?, ?, ?)
      `).run(sessionName, chatId, lastMessage, lastMessageTime);
    }

    return this.findByChatId(sessionName, chatId)!;
  }

  /**
   * Find conversation by chat ID
   */
  static findByChatId(sessionName: string, chatId: string): Conversation | undefined {
    return db.prepare(`
      SELECT * FROM conversations
      WHERE session_name = ? AND chat_id = ?
    `).get(sessionName, chatId) as Conversation | undefined;
  }

  /**
   * Get all conversations for a session
   */
  static findBySession(sessionName: string, options: {
    page?: number;
    limit?: number;
    status?: ConversationStatus;
    assignedAgent?: string;
  } = {}): { conversations: Conversation[]; total: number } {
    const { page = 1, limit = 50, status, assignedAgent } = options;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM conversations WHERE session_name = ?';
    const params: any[] = [sessionName];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (assignedAgent) {
      query += ' AND assigned_agent = ?';
      params.push(assignedAgent);
    }

    query += ' ORDER BY last_message_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const conversations = db.prepare(query).all(...params) as Conversation[];

    // Get total
    let countQuery = 'SELECT COUNT(*) as total FROM conversations WHERE session_name = ?';
    const countParams: any[] = [sessionName];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (assignedAgent) {
      countQuery += ' AND assigned_agent = ?';
      countParams.push(assignedAgent);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    return { conversations, total };
  }

  /**
   * Increment unread count
   */
  static incrementUnread(sessionName: string, chatId: string): Conversation | undefined {
    db.prepare(`
      UPDATE conversations
      SET 
        unread_count = unread_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `).run(sessionName, chatId);

    return this.findByChatId(sessionName, chatId);
  }

  /**
   * Reset unread count
   */
  static resetUnread(sessionName: string, chatId: string): Conversation | undefined {
    db.prepare(`
      UPDATE conversations
      SET 
        unread_count = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `).run(sessionName, chatId);

    return this.findByChatId(sessionName, chatId);
  }

  /**
   * Assign agent to conversation
   */
  static assignAgent(sessionName: string, chatId: string, agentId: string): Conversation | undefined {
db.prepare(`
      UPDATE conversations
      SET 
        assigned_agent = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `).run(agentId, sessionName, chatId);

    return this.findByChatId(sessionName, chatId);
  }

  /**
   * Update conversation status
   */
  static updateStatus(
    sessionName: string, 
    chatId: string, 
    status: ConversationStatus
  ): Conversation | undefined {
    db.prepare(`
      UPDATE conversations
      SET 
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `).run(status, sessionName, chatId);

    return this.findByChatId(sessionName, chatId);
  }

  /**
   * Update tags
   */
  static updateTags(sessionName: string, chatId: string, tags: string[]): Conversation | undefined {
    db.prepare(`
      UPDATE conversations
      SET 
        tags = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `).run(JSON.stringify(tags), sessionName, chatId);

    return this.findByChatId(sessionName, chatId);
  }

  /**
   * Rate conversation
   */
  static rate(sessionName: string, chatId: string, rating: number): Conversation | undefined {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    db.prepare(`
      UPDATE conversations
      SET 
        rating = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `).run(rating, sessionName, chatId);

    return this.findByChatId(sessionName, chatId);
  }
}

export default ConversationModel;