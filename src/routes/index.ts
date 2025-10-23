import { Router, Request, Response, NextFunction } from 'express';
import authRoutes from './auth.routes';
import sessionRoutes from './session.routes';
import messageRoutes from './message.routes';
import analyticsRoutes from './analytics.routes';
import backupRoutes from './backup.routes';
import tenantRoutes from './tenant.routes';
import userRoutes from './user.routes';
import healthService from '../services/health.service';
import { asyncHandler } from '../middleware/errorHandler.middleware';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/sessions', sessionRoutes);
router.use('/sessions', messageRoutes); // Message routes are under /sessions/:sessionName/messages
router.use('/analytics', analyticsRoutes);
router.use('/backups', backupRoutes);
router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);

// Basic health check
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Detailed health check with all system metrics
router.get('/health/detailed', asyncHandler(async (req: Request, res: Response) => {
  const healthStatus = await healthService.getHealthStatus();
  const statusCode = healthStatus.status === 'healthy' ? 200 :
    healthStatus.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthStatus);
}));

// Liveness probe (for Kubernetes/Docker)
router.get('/health/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe (for Kubernetes/Docker)
router.get('/health/ready', asyncHandler(async (req: Request, res: Response) => {
  const healthStatus = await healthService.getHealthStatus();

  // Only ready if healthy or degraded (not unhealthy)
  if (healthStatus.status === 'unhealthy') {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      reason: 'System is unhealthy',
    });
  } else {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  }
}));

export default router;