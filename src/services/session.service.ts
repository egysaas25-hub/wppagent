import SessionModel from '../models/session.model';
import { NotFoundError } from '../utils/errors';
import logger from '../config/logger';
import {
  CreateSessionDTO,
  UpdateSessionDTO,
  Session,
  SessionStats,
  PaginationQuery,
  SessionStatus
} from '../types';
import { tenantContext } from '../middleware/tenant.middleware';

class SessionService {
  /**
   * Create a new session
   */
  static create(sessionData: CreateSessionDTO & { tenantId?: string }): Session {
    logger.info('Creating new session', { 
      sessionName: sessionData.sessionName,
      tenantId: sessionData.tenantId, // ✅ Log tenant
    });

    // ✅ Ensure tenant_id is included
    const session = SessionModel.create({
      ...sessionData,
      tenantId: sessionData.tenantId,
    });

    logger.info('Session created successfully', { 
      sessionName: session.session_name,
      id: session.id,
      tenantId: session.tenant_id,
    });

    return session;
  }

  /**
   * Get session by name
   */
  static getByName(sessionName: string): Session {
    const session = SessionModel.findByName(sessionName);

    if (!session) {
      throw new NotFoundError('Session');
    }

    return session;
  }

  /**
   * Get all sessions
   */
  static getAll(options: PaginationQuery & { 
    status?: SessionStatus; 
    createdBy?: string;
    tenantId?: string;
  }): { sessions: Session[]; total: number } {
    return SessionModel.findAll({...options,
      tenantId: options.tenantId,
    });
  }

  /**
   * Update session
   */
  static update(sessionName: string, updates: UpdateSessionDTO): Session {
    logger.info('Updating session', { sessionName, updates });

    const session = SessionModel.update(sessionName, updates);

    logger.info('Session updated successfully', { sessionName });

    return session;
  }

  /**
   * Update session status
   */
  static updateStatus(sessionName: string, status: SessionStatus): Session {
    logger.info('Updating session status', { sessionName, status });

    return SessionModel.updateStatus(sessionName, status);
  }

  /**
   * Delete session
   */
  static delete(sessionName: string): boolean {
    logger.info('Deleting session', { sessionName });

    const deleted = SessionModel.delete(sessionName);

    if (deleted) {
      logger.info('Session deleted successfully', { sessionName });
    }

    return deleted;
  }

  /**
   * Get session statistics
   */
  static getStats(sessionName: string): SessionStats {
    // Verify session exists
    this.getByName(sessionName);

    return SessionModel.getStats(sessionName);
  }

  /**
   * Save QR code
   */
  static saveQRCode(sessionName: string, qrCode: string): Session {
    logger.info('Saving QR code for session', { sessionName });

    return SessionModel.saveQRCode(sessionName, qrCode);
  }

  /**
   * Save session token
   */
  static saveToken(sessionName: string, token: string): Session {
    logger.info('Saving token for session', { sessionName });

    return SessionModel.saveToken(sessionName, token);
  }

  /**
   * Update phone number
   */
  static updatePhoneNumber(sessionName: string, phoneNumber: string): Session {
    logger.info('Updating phone number for session', { sessionName, phoneNumber });

    return SessionModel.updatePhoneNumber(sessionName, phoneNumber);
  }
}

export default SessionService;