import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import config from './config/environment';
import logger from './config/logger';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware';
import { addRequestId, httpLogger, logRequestDetails } from './middleware/requestLogger.middleware';
import { apiLimiter } from './middleware/rateLimiter.middleware';

const app: Application = express();

// Trust proxy for rate limiting behind reverse proxies
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.socket.io', 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Compression middleware
app.use(compression());

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request tracking and logging
app.use(addRequestId);
app.use(httpLogger);
app.use(logRequestDetails);

// Serve static files from UI directory
const uiPath = path.join(__dirname, '../src/ui');
app.use(express.static(uiPath));

// Serve index.html for root path
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(uiPath, 'index.html'));
});

// Rate limiting
app.use('/api', apiLimiter);

// API routes
app.use('/api/v1', routes);
app.use('/api', routes);

// Health check endpoint (before rate limiting)
app.get('/health', (req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
    },
  };

  res.status(200).json(healthData);
});

// Readiness check endpoint
app.get('/ready', (req: Request, res: Response) => {
  // Add additional checks here (database, services, etc.)
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// Liveness check endpoint
app.get('/alive', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Error handler - must be last
app.use(errorHandler);

// Handle unhandled rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason: reason?.stack || reason,
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
  });

  // Give time for logs to flush, then exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

export default app;
