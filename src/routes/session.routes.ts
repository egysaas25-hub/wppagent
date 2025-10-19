import { Router } from 'express';
import SessionController from '../controllers/session.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { sessionValidators } from '../middleware/validators.middleware';
import { sessionLimiter } from '../middleware/rateLimiter.middleware';
import { UserRole } from '../types';

const router = Router();

/**
 * @route   POST /sessions
 * @desc    Create new session
 * @access  Private (Admin/Agent)
 */
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.AGENT),
  sessionLimiter,
  sessionValidators.create,
  SessionController.create
);

/**
 * @route   GET /sessions
 * @desc    Get all sessions
 * @access  Private
 */
router.get('/', authenticate, SessionController.getAll);

/**
 * @route   GET /sessions/:sessionName
 * @desc    Get session by name
 * @access  Private
 */
router.get('/:sessionName', authenticate, SessionController.getOne);

/**
 * @route   PATCH /sessions/:sessionName
 * @desc    Update session
 * @access  Private (Admin/Agent)
 */
router.patch(
  '/:sessionName',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.AGENT),
  sessionValidators.update,
  SessionController.update
);

/**
 * @route   DELETE /sessions/:sessionName
 * @desc    Delete session
 * @access  Private (Admin)
 */
router.delete(
  '/:sessionName',
  authenticate,
  authorize(UserRole.ADMIN),
  SessionController.delete
);

/**
 * @route   GET /sessions/:sessionName/stats
 * @desc    Get session statistics
 * @access  Private
 */
router.get('/:sessionName/stats', authenticate, SessionController.getStats);

/**
 * @route   POST /sessions/:sessionName/start
 * @desc    Start session
 * @access  Private (Admin/Agent)
 */
router.post(
  '/:sessionName/start',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.AGENT),
  SessionController.start
);

/**
 * @route   POST /sessions/:sessionName/stop
 * @desc    Stop session
 * @access  Private (Admin/Agent)
 */
router.post(
  '/:sessionName/stop',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.AGENT),
  SessionController.stop
);

/**
 * @route   GET /sessions/:sessionName/qr
 * @desc    Get QR code
 * @access  Private
 */
router.get('/:sessionName/qr', authenticate, SessionController.getQR);

export default router;