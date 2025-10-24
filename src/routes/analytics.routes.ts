import { Router, Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { authenticate } from '../middleware/auth.middleware';
import { requireTenant, tenantContext } from '../middleware/tenant.middleware';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { param, query } from 'express-validator';
import { validate } from '../middleware/validators.middleware';

const router = Router();

router.use(authenticate);
router.use(tenantContext);
router.use(requireTenant);

// All analytics routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/analytics/dashboard
 * @desc    Get dashboard metrics for current tenant
 * @access  Private
 */
router.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response) => {
    const metrics = AnalyticsService.getDashboardMetrics(req.tenant!.id);

    res.json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * @route   GET /api/v1/analytics/trends
 * @desc    Get message trends over time
 * @access  Private
 */
router.get(
  '/trends',
  [
    query('days').optional().isInt({ min: 1, max: 90 }).toInt().withMessage('Days must be between 1 and 90'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 7;
    const trends = AnalyticsService.getMessageTrends(req.tenant!.id, days);

    res.json({
      success: true,
      data: trends,
    });
  })
);

/**
 * @route   GET /api/v1/analytics/sessions/:sessionName/activity
 * @desc    Get session activity log
 * @access  Private
 */
router.get(
  '/sessions/:sessionName/activity',
  [
    param('sessionName').notEmpty().withMessage('Session name is required'),
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const activity = AnalyticsService.getSessionActivity(req.params.sessionName, limit);

    res.json({
      success: true,
      data: activity,
    });
  })
);

/**
 * @route   GET /api/v1/analytics/events
 * @desc    Get analytics events
 * @access  Private
 */
router.get(
  '/events',
  [
    query('event_type').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const eventType = req.query.event_type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;

    const events = AnalyticsService.getEvents(req.tenant!.id, eventType, limit);

    res.json({
      success: true,
      data: events,
    });
  })
);

/**
 * @route   POST /api/v1/analytics/events
 * @desc    Track a custom analytics event
 * @access  Private
 */
router.post(
  '/events',
  asyncHandler(async (req: Request, res: Response) => {
    const { session_name, event_type, event_data } = req.body;

    AnalyticsService.trackEvent({
      tenant_id: req.tenant!.id,
      session_name,
      event_type,
      event_data,
      timestamp: Date.now(),
    });

    res.status(201).json({
      success: true,
      message: 'Event tracked successfully',
    });
  })
);

/**
 * @route   DELETE /api/v1/analytics/cleanup
 * @desc    Clean up old analytics data
 * @access  Admin only
 */
router.delete(
  '/cleanup',
  [
    query('days').optional().isInt({ min: 1 }).toInt().withMessage('Days must be a positive integer'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 90;

    AnalyticsService.cleanupOldData(days);

    res.json({
      success: true,
      message: `Analytics data older than ${days} days has been cleaned up`,
    });
  })
);

export default router;
