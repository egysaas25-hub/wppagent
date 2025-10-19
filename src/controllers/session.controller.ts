import { Request, Response } from 'express';
import SessionService from '../services/session.service';
import { ApiResponse } from '../utils/response';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { CreateSessionDTO, UpdateSessionDTO, SessionStatus } from '../types';

class SessionController {
  /**
   * Create new session
   * POST /sessions
   */
  static create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName, autoReconnect } = req.body;

    const sessionData: CreateSessionDTO = {
      sessionName,
      createdBy: req.user!.id,
      autoReconnect,
    };

    const session = SessionService.create(sessionData);

    res.status(201).json(
      ApiResponse.success(session, 'Session created successfully')
    );
  });

  /**
   * Get all sessions
   * GET /sessions
   */
  static getAll = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, status } = req.query;

    const result = SessionService.getAll({
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      status: status as SessionStatus,
      createdBy: req.user!.role === 'admin' ? undefined : req.user!.id,
    });

    res.json(
      ApiResponse.paginated(result.sessions, {
        page: parseInt((page as string) || '1'),
        limit: parseInt((limit as string) || '50'),
        total: result.total,
      })
    );
  });

  /**
   * Get session by name
   * GET /sessions/:sessionName
   */
  static getOne = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;

    const session = SessionService.getByName(sessionName);

    res.json(
      ApiResponse.success(session)
    );
  });

  /**
   * Update session
   * PATCH /sessions/:sessionName
   */
  static update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;
    const updates: UpdateSessionDTO = req.body;

    const session = SessionService.update(sessionName, updates);

    res.json(
      ApiResponse.success(session, 'Session updated successfully')
    );
  });

  /**
   * Delete session
   * DELETE /sessions/:sessionName
   */
  static delete = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;

    SessionService.delete(sessionName);

    res.json(
      ApiResponse.success(null, 'Session deleted successfully')
    );
  });

  /**
   * Get session statistics
   * GET /sessions/:sessionName/stats
   */
  static getStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;

    const stats = SessionService.getStats(sessionName);

    res.json(
      ApiResponse.success(stats)
    );
  });

  /**
   * Start session (connect to WhatsApp)
   * POST /sessions/:sessionName/start
   */
  static start = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;

    // This will be implemented in SessionManager
    // For now, just update status
    SessionService.updateStatus(sessionName, SessionStatus.CONNECTING);

    res.json(
      ApiResponse.success(null, 'Session start requested')
    );
  });

  /**
   * Stop session
   * POST /sessions/:sessionName/stop
   */
  static stop = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;

    SessionService.updateStatus(sessionName, SessionStatus.DISCONNECTED);

    res.json(
      ApiResponse.success(null, 'Session stopped')
    );
  });

  /**
   * Get QR code
   * GET /sessions/:sessionName/qr
   */
  static getQR = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;

    const session = SessionService.getByName(sessionName);

    res.json(
      ApiResponse.success({ qr_code: session.qr_code })
    );
  });
}

export default SessionController;