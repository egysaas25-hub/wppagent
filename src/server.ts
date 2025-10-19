import app from './app';
import config from './config/environment';
import logger from './config/logger';
import db from './config/database';
import SessionManager from './services/whatsapp-session.manager';
import { WebSocketService } from './services/websocket.service';

const PORT = config.port;

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`🚀 Server running in ${config.env} mode`);
  logger.info(`📡 Listening on port ${PORT}`);
  logger.info(`🔗 API: http://localhost:${PORT}/api/v1`);
  logger.info(`💚 Health: http://localhost:${PORT}/health`);
  logger.info(`🔌 WebSocket: ws://localhost:${PORT}/socket.io`);

  // Initialize WebSocket
  new WebSocketService(server);
  logger.info('✅ WebSocket initialized');

  // Initialize existing sessions
  try {
    await SessionManager.initializeSessions();
    logger.info('✅ Sessions initialized');
  } catch (error) {
    logger.error('Failed to initialize sessions', { error: error.message });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received: Starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Cleanup all WhatsApp sessions
  try {
    await SessionManager.cleanup();
    logger.info('All sessions closed');
  } catch (error) {
    logger.error('Error closing sessions', { error: error.message });
  }

  // Close database
  db.close();
  logger.info('Database connection closed');

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection', { reason });
  gracefulShutdown('unhandledRejection');
});

export default server;