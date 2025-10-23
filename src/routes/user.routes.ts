import { Router, Request, Response } from 'express';
import UserModel from '../models/user.model';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validators.middleware';
import { NotFoundError, ValidationError } from '../utils/errors';
import { UserRole, UserStatus } from '../types';

const router = Router();

/**
 * @route   POST /api/v1/users
 * @desc    Create a new user
 * @access  Admin only
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').optional().trim().notEmpty(),
    body('role').optional().isIn(['admin', 'agent', 'user']).withMessage('Invalid role'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;

    const user = await UserModel.create({
      email,
      password,
      name,
      role: role || UserRole.AGENT,
    });

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully',
    });
  })
);

/**
 * @route   GET /api/v1/users
 * @desc    List all users
 * @access  Admin only
 */
router.get(
  '/',
  authenticate,
  authorize('admin'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('role').optional().isIn(['admin', 'agent', 'user']),
    query('status').optional().isIn(['active', 'inactive']),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const role = req.query.role as UserRole | undefined;
    const status = req.query.status as UserStatus | undefined;

    const result = UserModel.findAll({ page, limit, role, status });

    res.json({
      success: true,
      users: result.users,
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    });
  })
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Admin only
 */
router.get(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').notEmpty().withMessage('User ID is required'), validate],
  asyncHandler(async (req: Request, res: Response) => {
    const user = UserModel.findById(req.params.id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      success: true,
      data: user,
    });
  })
);

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user
 * @access  Admin only
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  [
    param('id').notEmpty().withMessage('User ID is required'),
    body('name').optional().trim().notEmpty(),
    body('role').optional().isIn(['admin', 'agent', 'user']),
    body('status').optional().isIn(['active', 'inactive']),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const user = UserModel.update(req.params.id, req.body);

    res.json({
      success: true,
      data: user,
      message: 'User updated successfully',
    });
  })
);

/**
 * @route   POST /api/v1/users/:id/change-password
 * @desc    Change user password
 * @access  Admin only
 */
router.post(
  '/:id/change-password',
  authenticate,
  authorize('admin'),
  [
    param('id').notEmpty().withMessage('User ID is required'),
    body('new_password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { new_password } = req.body;

    const user = await UserModel.updatePassword(req.params.id, new_password);

    res.json({
      success: true,
      data: user,
      message: 'Password updated successfully',
    });
  })
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user (soft delete)
 * @access  Admin only
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  [param('id').notEmpty().withMessage('User ID is required'), validate],
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = UserModel.delete(req.params.id);

    if (!deleted) {
      throw new NotFoundError('User not found');
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  })
);

export default router;
