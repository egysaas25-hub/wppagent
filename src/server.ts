import app from './app';
import config from './config/environment';
import logger from './config/logger';
import db from './config/database';

const PORT = config.port;

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running in ${config.env} mode`);
  logger.info(`📡 Listening on port ${PORT}`);
  logger.info(`🔗 API: http://localhost:${PORT}/api/v1`);
  logger.info(`💚 Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received: Starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');

    // Close database
    db.close();
    logger.info('Database connection closed');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;