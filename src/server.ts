import app from './app';
import config from './config/environment';
import logger from './config/logger';
import db from './config/database';
import SessionManager from './services/whatsapp-session.manager';
import { WebSocketService } from './services/websocket.service';
import healthService from './services/health.service';
import { MemoryMonitor, resourceCleaner } from './utils/memory.utils';
import { optimizeDatabase, applyPerformanceOptimizations } from './utils/database.utils';

const PORT = config.port;
let isShuttingDown = false;

// Initialize memory monitor
const memoryMonitor = new MemoryMonitor();

// Memory event handlers
memoryMonitor.on('warning', (data) => {
  logger.warn('High memory usage detected', data);
});

memoryMonitor.on('critical', (data) => {
  logger.error('Critical memory usage detected', data);
  // Force garbage collection if available
  memoryMonitor.forceGC();
});

memoryMonitor.on('leak', (leak) => {
  logger.error('Memory leak detected', {
    growth: leak.growth,
    message: leak.message,
  });
});

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`🚀 Server running in ${config.env} mode`);
  logger.info(`📡 Listening on port ${PORT}`);
  logger.info(`🔗 API: http://localhost:${PORT}/api/v1`);
  logger.info(`💚 Health: http://localhost:${PORT}/health`);
  logger.info(`🔌 WebSocket: ws://localhost:${PORT}/socket.io`);

  // Apply database optimizations
  try {
    applyPerformanceOptimizations(db);
    logger.info('✅ Database optimizations applied');
  } catch (error: any) {
    logger.error('Failed to apply database optimizations', { error: error.message });
  }

  // Initialize WebSocket
  const wsService = new WebSocketService(server);
  resourceCleaner.register('websocket', () => {
    wsService.close();
  });
  logger.info('✅ WebSocket initialized');

  // Initialize existing sessions
  try {
    await SessionManager.initializeSessions();
    logger.info('✅ Sessions initialized');
  } catch (error: any) {
    logger.error('Failed to initialize sessions', { error: error.message });
  }

  // Start health monitoring
  const healthMonitorInterval = healthService.startMonitoring(60000);
  resourceCleaner.register('health-monitor', () => {
    clearInterval(healthMonitorInterval);
  });
  logger.info('✅ Health monitoring started');

  // Start memory monitoring
  memoryMonitor.start(30000);
  resourceCleaner.register('memory-monitor', () => {
    memoryMonitor.stop();
  });
  logger.info('✅ Memory monitoring started');

  // Periodic database optimization (every 6 hours)
  const dbOptimizationInterval = setInterval(() => {
    try {
      optimizeDatabase(db);
    } catch (error: any) {
      logger.error('Database optimization failed', { error: error.message });
    }
  }, 6 * 60 * 60 * 1000);

  resourceCleaner.register('db-optimization', () => {
    clearInterval(dbOptimizationInterval);
  });

  logger.info('✅ Server started successfully');
});

// Set timeout for keep-alive connections
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, forcing exit...');
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`${signal} received: Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Set shutdown timeout
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 seconds timeout

  try {
    // Stop health and memory monitoring
    logger.info('Stopping monitoring services...');
    resourceCleaner.cleanup('health-monitor');
    resourceCleaner.cleanup('memory-monitor');
    resourceCleaner.cleanup('db-optimization');

    // Cleanup all WhatsApp sessions
    logger.info('Closing WhatsApp sessions...');
    await SessionManager.cleanup();
    logger.info('All sessions closed');

    // Close WebSocket
    logger.info('Closing WebSocket connections...');
    resourceCleaner.cleanup('websocket');

    // Close database with optimization
    logger.info('Closing database...');
    try {
      optimizeDatabase(db);
    } catch (error: any) {
      logger.warn('Final database optimization failed', { error: error.message });
    }
    db.close();
    logger.info('Database connection closed');

    // Clean up any remaining resources
    logger.info('Cleaning up remaining resources...');
    resourceCleaner.cleanupAll();

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during graceful shutdown', {
      error: error.message,
      stack: error.stack,
    });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });

  // Give time for logging
  setTimeout(() => {
    gracefulShutdown('uncaughtException');
  }, 100);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', {
    reason: reason?.stack || reason,
    promise,
  });

  // Give time for logging
  setTimeout(() => {
    gracefulShutdown('unhandledRejection');
  }, 100);
});

// Handle warning events
process.on('warning', (warning) => {
  logger.warn('Process warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
  });
});

export default server;