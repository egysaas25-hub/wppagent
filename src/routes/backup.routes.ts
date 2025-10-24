import { Router, Request, Response } from 'express';
import { BackupService } from '../services/backup.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { param, query, body } from 'express-validator';
import { validate } from '../middleware/validators.middleware';
import { NotFoundError } from '../utils/errors';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// All backup routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/backups
 * @desc    Create a new backup
 * @access  Admin only
 */
router.post(
  '/',
  authorize('admin'),
  [
    body('tenant_id').optional().trim(),
    body('type')
      .optional()
      .isIn(['full', 'incremental', 'manual'])
      .withMessage('Invalid backup type'),
    body('compress').optional().isBoolean().toBoolean(),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { tenant_id, type, compress } = req.body;

    const backup = await BackupService.createBackup({
      tenantId: tenant_id,
      type,
      compress,
    });

    res.status(201).json({
      success: true,
      data: backup,
      message: 'Backup created successfully',
    });
  })
);

/**
 * @route   GET /api/v1/backups
 * @desc    List all backups
 * @access  Admin only
 */
router.get(
  '/',
  authorize('admin'),
  [
    query('tenant_id').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.query.tenant_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const backups = BackupService.listBackups(tenantId, limit);

    res.json({
      success: true,
      data: backups,
    });
  })
);

/**
 * @route   GET /api/v1/backups/stats
 * @desc    Get backup statistics
 * @access  Admin only
 */
router.get(
  '/stats',
  authorize('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const stats = BackupService.getBackupStats();

    res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * @route   POST /api/v1/backups/:id/restore
 * @desc    Restore from backup
 * @access  Admin only
 */
router.post(
  '/:id/restore',
  authorize('admin'),
  [
    param('id').isInt({ min: 1 }).toInt().withMessage('Invalid backup ID'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const backupId = parseInt(req.params.id);

    await BackupService.restoreBackup(backupId);

    res.json({
      success: true,
      message: 'Database restored successfully. Please restart the application.',
    });
  })
);

/**
 * @route   POST /api/v1/backups/export-tenant
 * @desc    Export tenant data
 * @access  Admin only
 */
router.post(
  '/export-tenant',
  authorize('admin'),
  [
    body('tenant_id').trim().notEmpty().withMessage('Tenant ID is required'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { tenant_id } = req.body;

    const exportPath = await BackupService.exportTenantData(tenant_id);

    res.json({
      success: true,
      data: {
        export_path: exportPath,
      },
      message: 'Tenant data exported successfully',
    });
  })
);

/**
 * @route   DELETE /api/v1/backups/cleanup
 * @desc    Delete old backups
 * @access  Admin only
 */
router.delete(
  '/cleanup',
  authorize('admin'),
  [
    query('days').optional().isInt({ min: 1 }).toInt().withMessage('Days must be a positive integer'),
    validate,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;

    BackupService.deleteOldBackups(days);

    res.json({
      success: true,
      message: `Backups older than ${days} days have been deleted`,
    });
  })
);

export default router;
