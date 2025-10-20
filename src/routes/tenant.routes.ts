import { Router, Request, Response } from 'express';
import { TenantModel } from '../models/tenant.model';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { ValidationError, NotFoundError } from '../utils/errors';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validators.middleware';

const router = Router();

/**
 * @route   POST /api/v1/tenants
 * @desc    Create a new tenant
 * @access  Admin only
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('slug')
      .trim()
      .notEmpty()
      .matches(/^[a-z0-9-]+$/)
      .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone').optional().isMobilePhone('any'),
    body('plan')
      .optional()
      .isIn(['free', 'basic', 'pro', 'enterprise'])
      .withMessage('Invalid plan'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { name, slug, email, phone, plan, max_sessions, max_users, settings } = req.body;

    // Check if slug already exists
    const existing = TenantModel.findBySlug(slug);
    if (existing) {
      throw new ValidationError('Tenant with this slug already exists');
    }

    const tenant = TenantModel.create({
      name,
      slug,
      email,
      phone,
      plan,
      max_sessions,
      max_users,
      settings,
    });

    res.status(201).json({
      success: true,
      data: tenant,
    });
  })
);

/**
 * @route   GET /api/v1/tenants
 * @desc    List all tenants
 * @access  Admin only
 */
router.get(
  '/',
  authenticate,
  authorize('admin'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['active', 'suspended', 'cancelled']),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as 'active' | 'suspended' | 'cancelled' | undefined;

    const result = TenantModel.list(page, limit, status);

    res.json({
      success: true,
      data: result.tenants,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.ceil(result.total / result.limit),
      },
    });
  })
);

/**
 * @route   GET /api/v1/tenants/:id
 * @desc    Get tenant by ID
 * @access  Admin only
 */
router.get(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').notEmpty().withMessage('Tenant ID is required'), validate],
  asyncHandler(async (req: Request, res: Response) => {
    const tenant = TenantModel.findById(req.params.id);

    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    res.json({
      success: true,
      data: tenant,
    });
  })
);

/**
 * @route   PATCH /api/v1/tenants/:id
 * @desc    Update tenant
 * @access  Admin only
 */
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  [
    param('id').notEmpty().withMessage('Tenant ID is required'),
    body('name').optional().trim().notEmpty(),
    body('email').optional().isEmail(),
    body('phone').optional().isMobilePhone('any'),
    body('plan').optional().isIn(['free', 'basic', 'pro', 'enterprise']),
    body('status').optional().isIn(['active', 'suspended', 'cancelled']),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const tenant = TenantModel.update(req.params.id, req.body);

    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    res.json({
      success: true,
      data: tenant,
    });
  })
);

/**
 * @route   DELETE /api/v1/tenants/:id
 * @desc    Delete tenant
 * @access  Admin only
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').notEmpty().withMessage('Tenant ID is required'), validate],
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = TenantModel.delete(req.params.id);

    if (!deleted) {
      throw new NotFoundError('Tenant not found');
    }

    res.json({
      success: true,
      message: 'Tenant deleted successfully',
    });
  })
);

/**
 * @route   GET /api/v1/tenants/:id/stats
 * @desc    Get tenant statistics
 * @access  Admin only
 */
router.get(
  '/:id/stats',
  authenticate,
  authorize('admin'),
  [param('id').notEmpty().withMessage('Tenant ID is required'), validate],
  asyncHandler(async (req: Request, res: Response) => {
    const tenant = TenantModel.findById(req.params.id);

    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }

    const stats = TenantModel.getStats(req.params.id);

    res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   GET /api/v1/tenants/:id/settings
 * @desc    Get tenant settings
 * @access  Admin only
 */
router.get(
  '/:id/settings',
  authenticate,
  authorize('admin'),
  [param('id').notEmpty().withMessage('Tenant ID is required'), validate],
  asyncHandler(async (req: Request, res: Response) => {
    const settings = TenantModel.getSettings(req.params.id);

    res.json({
      success: true,
      data: settings,
    });
  })
);

/**
 * @route   PATCH /api/v1/tenants/:id/settings
 * @desc    Update tenant settings
 * @access  Admin only
 */
router.patch(
  '/:id/settings',
  authenticate,
  authorize('admin'),
  [param('id').notEmpty().withMessage('Tenant ID is required'), validate],
  asyncHandler(async (req: Request, res: Response) => {
    const updated = TenantModel.updateSettings(req.params.id, req.body);

    if (!updated) {
      throw new NotFoundError('Tenant not found');
    }

    const settings = TenantModel.getSettings(req.params.id);

    res.json({
      success: true,
      data: settings,
    });
  })
);

export default router;
