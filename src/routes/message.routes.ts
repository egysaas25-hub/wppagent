import { Router } from 'express';
import MessageController from '../controllers/message.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { messageValidators } from '../middleware/validators.middleware';
import { messageLimiter } from '../middleware/rateLimiter.middleware';
import { UserRole } from '../types';

const router = Router();

/**
 * @route   GET /sessions/:sessionName/messages
 * @desc    Get messages
 * @access  Private
 */
router.get(
  '/:sessionName/messages',
  authenticate,
  messageValidators.list,
  MessageController.getAll
);

/**
 * @route   POST /sessions/:sessionName/messages
 * @desc    Send text message
 * @access  Private (Admin/Agent)
 */
router.post(
  '/:sessionName/messages',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.AGENT),
  messageLimiter,
  messageValidators.sendText,
  MessageController.sendText
);

/**
 * @route   GET /sessions/:sessionName/messages/unread
 * @desc    Get unread message count
 * @access  Private
 */
router.get(
  '/:sessionName/messages/unread',
  authenticate,
  MessageController.getUnreadCount
);

/**
 * @route   GET /sessions/:sessionName/messages/search
 * @desc    Search messages
 * @access  Private
 */
router.get(
  '/:sessionName/messages/search',
  authenticate,
  MessageController.search
);

/**
 * @route   PATCH /sessions/:sessionName/messages/:messageId/read
 * @desc    Mark message as read
 * @access  Private
 */
router.patch(
  '/:sessionName/messages/:messageId/read',
  authenticate,
  MessageController.markAsRead
);

export default router;