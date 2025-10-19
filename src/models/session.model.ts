import db from '../config/database';
import { Encryption } from '../utils/encryption';
import { NotFoundError, ConflictError } from '../utils/errors';
import {
  Session,
  SessionWithDecryptedToken,
  CreateSessionDTO,
  UpdateSessionDTO,
  SessionStatus,
  SessionStats,
  PaginationQuery
} from '../types';

class SessionModel {
  /**
   * Create a new session
   */
  static create(sessionData: CreateSessionDTO): Session {
    const { sessionName, createdBy, autoReconnect = true } = sessionData;

    const existing = this.findByName(sessionName);
    if (existing) {
      throw new ConflictError('Session with this name already exists');
    }

    db.prepare(`
      INSERT INTO sessions (session_name, created_by, auto_reconnect, status)
      VALUES (?, ?, ?, ?)
    `).run(sessionName, createdBy, autoReconnect ? 1 : 0, SessionStatus.DISCONNECTED);

    return this.findByName(sessionName)!;
  }

  /**
   * Find session by name
   */
  static findByName(sessionName: string): SessionWithDecryptedToken | undefined {
    const session = db.prepare(`
      SELECT 
        id, session_name, phone_number, status, qr_code,
        token, token_iv, token_auth_tag,
        auto_reconnect, created_by, created_at, updated_at
      FROM sessions
      WHERE session_name = ?
    `).get(sessionName) as any;

    if (!session) return undefined;

    // Convert auto_reconnect to boolean
    session.auto_reconnect = Boolean(session.auto_reconnect);

    // Decrypt token if exists
    if (session.token && session.token_iv && session.token_auth_tag) {
      try {
        session.decrypted_token = Encryption.decrypt(
          session.token,
          session.token_iv,
          session.token_auth_tag
        );
      } catch (error) {
        session.decrypted_token = null;
      }
    }

    return session as SessionWithDecryptedToken;
  }

  /**
   * Get all sessions
   */
  static findAll(options: PaginationQuery & { 
    status?: SessionStatus; 
    createdBy?: string;
  }): { sessions: Session[]; total: number } {
    const { page = 1, limit = 50, status, createdBy } = options;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        id, session_name, phone_number, status, 
        auto_reconnect, created_by, created_at, updated_at
      FROM sessions 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (createdBy) {
      query += ' AND created_by = ?';
      params.push(createdBy);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const sessions = db.prepare(query).all(...params) as any[];

    // Convert auto_reconnect to boolean
    sessions.forEach(s => s.auto_reconnect = Boolean(s.auto_reconnect));

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM sessions WHERE 1=1';
    const countParams: any[] = [];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (createdBy) {
      countQuery += ' AND created_by = ?';
      countParams.push(createdBy);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    return { sessions: sessions as Session[], total };
  }

  /**
   * Update session status
   */
  static updateStatus(sessionName: string, status: SessionStatus): Session {
    const result = db.prepare(`
      UPDATE sessions
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ?
    `).run(status, sessionName);

    if (result.changes === 0) {
      throw new NotFoundError('Session');
    }

    return this.findByName(sessionName)!;
  }

  /**
   * Update session phone number
   */
  static updatePhoneNumber(sessionName: string, phoneNumber: string): Session {
    db.prepare(`
      UPDATE sessions
      SET phone_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ?
    `).run(phoneNumber, sessionName);

    return this.findByName(sessionName)!;
  }

  /**
   * Save session token (encrypted)
   */
  static saveToken(sessionName: string, token: string): Session {
    const encrypted = Encryption.encrypt(token);

    if (!encrypted) {
      throw new Error('Failed to encrypt token');
    }

    db.prepare(`
      UPDATE sessions
      SET 
        token = ?,
        token_iv = ?,
        token_auth_tag = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ?
    `).run(
      encrypted.encrypted,
      encrypted.iv,
      encrypted.authTag,
      sessionName
    );

    return this.findByName(sessionName)!;
  }

  /**
   * Save QR code
   */
  static saveQRCode(sessionName: string, qrCode: string): Session {
    db.prepare(`
      UPDATE sessions
      SET qr_code = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ?
    `).run(qrCode, sessionName);

    return this.findByName(sessionName)!;
  }

  /**
   * Update session settings
   */
  static update(sessionName: string, updates: UpdateSessionDTO): Session {
    const session = this.findByName(sessionName);
    if (!session) {
      throw new NotFoundError('Session');
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.auto_reconnect !== undefined) {
      setClauses.push('auto_reconnect = ?');
      params.push(updates.auto_reconnect ? 1 : 0);
    }

    if (setClauses.length === 0) {
      return session;
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    params.push(sessionName);

    db.prepare(`
      UPDATE sessions
      SET ${setClauses.join(', ')}
      WHERE session_name = ?
    `).run(...params);

    return this.findByName(sessionName)!;
  }

  /**
   * Delete session
   */
  static delete(sessionName: string): boolean {
    // Delete related data first
    db.prepare('DELETE FROM messages WHERE session_name = ?').run(sessionName);
    db.prepare('DELETE FROM conversations WHERE session_name = ?').run(sessionName);
    db.prepare('DELETE FROM contacts WHERE session_name = ?').run(sessionName);
    
    const result = db.prepare('DELETE FROM sessions WHERE session_name = ?').run(sessionName);
    
    return result.changes > 0;
  }

  /**
   * Get session statistics
   */
  static getStats(sessionName: string): SessionStats {
    return db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM messages WHERE session_name = ? AND from_me = 1) as messages_sent,
        (SELECT COUNT(*) FROM messages WHERE session_name = ? AND from_me = 0) as messages_received,
        (SELECT COUNT(*) FROM contacts WHERE session_name = ?) as total_contacts,
        (SELECT COUNT(*) FROM conversations WHERE session_name = ?) as total_conversations,
        (SELECT COUNT(*) FROM conversations WHERE session_name = ? AND status = 'open') as open_conversations
    `).get(sessionName, sessionName, sessionName, sessionName, sessionName) as SessionStats;
  }
}

export default SessionModel;