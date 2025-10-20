import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import SessionManager from './whatsapp-session.manager';
import logger from '../config/logger';
import jwt from 'jsonwebtoken';
import config from '../config/environment';

export class WebSocketService {
  private io: SocketIOServer;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      path: '/socket.io/',
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();
    this.setupSessionManagerListeners();
    
    logger.info('WebSocket service initialized');
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        socket.data.user = decoded;
        logger.debug('WebSocket authenticated', { userId: decoded.id });
        next();
      } catch (error) {
        logger.warn('WebSocket authentication failed', { error: error.message });
        next(new Error('Invalid token'));
      }
    });
  }

  /**
   * Setup connection handlers
   */
  private setupConnectionHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', { 
        userId: socket.data.user.id,
        socketId: socket.id,
      });

      // Join session room
      socket.on('join-session', (sessionName: string) => {
        socket.join(`session:${sessionName}`);
        logger.info('Client joined session room', { 
          sessionName, 
          userId: socket.data.user.id 
        });
        
        // Send current session status
        const isActive = SessionManager.isSessionActive(sessionName);
        socket.emit('session-status', { sessionName, isActive });
      });

      // Leave session room
      socket.on('leave-session', (sessionName: string) => {
        socket.leave(`session:${sessionName}`);
        logger.info('Client left session room', { 
          sessionName, 
          userId: socket.data.user.id 
        });
      });

      // Get active sessions
      socket.on('get-active-sessions', () => {
        const activeSessions = SessionManager.getActiveSessions();
        socket.emit('active-sessions', activeSessions);
      });

      socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected', { 
          userId: socket.data.user.id,
          socketId: socket.id,
        });
      });

      socket.on('error', (error) => {
        logger.error('WebSocket error', { 
          error: error.message,
          userId: socket.data.user.id,
        });
      });
    });
  }

  /**
   * Setup SessionManager event listeners
   */
  private setupSessionManagerListeners() {
    // QR Code generated
    SessionManager.on('qr', ({ sessionName, qr, attempt }) => {
      logger.debug('Broadcasting QR code', { sessionName, attempt });
      this.io.to(`session:${sessionName}`).emit('qr', { 
        sessionName,
        qr, 
        attempt,
        timestamp: new Date().toISOString(),
      });
    });

    // Status changed
    SessionManager.on('status', ({ sessionName, status }) => {
      logger.debug('Broadcasting status change', { sessionName, status });
      this.io.to(`session:${sessionName}`).emit('status', { 
        sessionName,
        status,
        timestamp: new Date().toISOString(),
      });
    });

    // Connected
    SessionManager.on('connected', ({ sessionName }) => {
      logger.info('Broadcasting connection', { sessionName });
      this.io.to(`session:${sessionName}`).emit('connected', { 
        sessionName,
        timestamp: new Date().toISOString(),
      });
    });

    // New message received
    SessionManager.on('message', ({ sessionName, message }) => {
      logger.debug('Broadcasting new message', { 
        sessionName, 
        from: message.from 
      });
      this.io.to(`session:${sessionName}`).emit('message', { 
        sessionName,
        message: {
          id: message.id,
          chatId: message.chatId,
          from: message.from,
          fromMe: message.fromMe,
          body: message.body,
          type: message.type,
          timestamp: message.timestamp,
        },
      });
    });

    // Message ACK update
    SessionManager.on('ack', ({ sessionName, messageId, ack }) => {
      logger.debug('Broadcasting ACK update', { sessionName, messageId, ack });
      this.io.to(`session:${sessionName}`).emit('ack', { 
        sessionName,
        messageId,
        ack,
        timestamp: new Date().toISOString(),
      });
    });

    // Loading screen
    SessionManager.on('loading', ({ sessionName, percent, message }) => {
      this.io.to(`session:${sessionName}`).emit('loading', { 
        sessionName,
        percent,
        message,
      });
    });

    // Disconnected
    SessionManager.on('disconnected', ({ sessionName }) => {
      logger.info('Broadcasting disconnection', { sessionName });
      this.io.to(`session:${sessionName}`).emit('disconnected', { 
        sessionName,
        timestamp: new Date().toISOString(),
      });
    });

    // State change
    SessionManager.on('stateChange', ({ sessionName, state }) => {
      logger.debug('Broadcasting state change', { sessionName, state });
      this.io.to(`session:${sessionName}`).emit('state-change', { 
        sessionName,
        state,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Broadcast to specific session
   */
  public broadcastToSession(sessionName: string, event: string, data: any) {
    this.io.to(`session:${sessionName}`).emit(event, data);
  }

  /**
   * Broadcast to all clients
   */
  public broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.io.engine.clientsCount;
  }

  /**
   * Close WebSocket server
   */
  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Closing WebSocket server...');

      this.io.close((err) => {
        if (err) {
          logger.error('Error closing WebSocket server', { error: err.message });
          reject(err);
        } else {
          logger.info('WebSocket server closed successfully');
          resolve();
        }
      });
    });
  }
}