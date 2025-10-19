import { Router } from 'express';
import authRoutes from './auth.routes';
import sessionRoutes from './session.routes';
import messageRoutes from './message.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/sessions', sessionRoutes);
router.use('/sessions', messageRoutes); // Message routes are under /sessions/:sessionName/messages

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;