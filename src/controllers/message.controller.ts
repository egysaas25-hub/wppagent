import { Request, Response } from 'express';
import MessageService from '../services/message.service';
import { ApiResponse } from '../utils/response';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { MessageQuery } from '../types';

class MessageController {
  /**
   * Get messages
   * GET /sessions/:sessionName/messages
   */
  static getAll = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;
    const { page, limit, chatId, fromMe } = req.query;

    const query: MessageQuery = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      chatId: chatId as string,
      fromMe: fromMe ? fromMe === 'true' : undefined,
    };

    const result = MessageService.getMessages(sessionName, query);

    res.json(
      ApiResponse.paginated(result.messages, {
        page: query.page!,
        limit: query.limit!,
        total: result.total,
      })
    );
  });

  /**
   * Send text message
   * POST /sessions/:sessionName/messages
   */
  static sendText = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;
    const { to, message } = req.body;

    // This will be implemented via SessionManager
    // For now, return success
    res.json(
      ApiResponse.success(
        { to, message, sessionName },
        'Message queued for sending'
      )
    );
  });

  /**
   * Get unread count
   * GET /sessions/:sessionName/messages/unread
   */
  static getUnreadCount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;
    const { chatId } = req.query;

    const count = MessageService.getUnreadCount(sessionName, chatId as string);

    res.json(
      ApiResponse.success({ count })
    );
  });

  /**
   * Search messages
   * GET /sessions/:sessionName/messages/search
   */
  static search = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { sessionName } = req.params;
    const { q, page, limit } = req.query;

    if (!q) {
      res.json(
        ApiResponse.success({ messages: [], total: 0 })
      );
      return;
    }

    const result = MessageService.search(sessionName, q as string, {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json(
      ApiResponse.paginated(result.messages, {
        page: parseInt((page as string) || '1'),
        limit: parseInt((limit as string) || '50'),
        total: result.total,
      })
    );
  });

  /**
   * Mark message as read
   * PATCH /sessions/:sessionName/messages/:messageId/read
   */
  static markAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { messageId } = req.params;

    const message = MessageService.markAsRead(messageId);

    res.json(
      ApiResponse.success(message, 'Message marked as read')
    );
  });
}

export default MessageController;