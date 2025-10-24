import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import SessionManager from './whatsapp-session.manager';
import presenceService from './presence.service';
import { AnalyticsService } from './analytics.service';
import logger from '../config/logger';
import jwt from 'jsonwebtoken';
import config from '../config/environment';

export class WebSocketService {
  private io: SocketIOServer;
  private activeConnections: Map<string, Set<string>> = new Map(); // Track connections by userId

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      path: '/socket.io/',
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 1e6, // Limit buffer size to 1MB
      connectTimeout: 45000,
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();
    this.setupSessionManagerListeners();
    this.setupPresenceListeners();

    // Clean up stale connections periodically
    setInterval(() => {
      this.cleanupStaleConnections();
    }, 5 * 60 * 1000); // Every 5 minutes

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
      } catch (error: any) {
        logger.warn('WebSocket authentication failed', { error: error.message });
        next(new Error('Invalid token'));
      }
    });
  }

  /**
   * Setup connection handlers with proper cleanup
   */
  private setupConnectionHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.user.id;
      const tenantId = socket.data.user.tenant_id;

      logger.info('WebSocket client connected', {
        userId,
        socketId: socket.id,
        tenantId,
      });

      // Track connection
      if (!this.activeConnections.has(userId)) {
        this.activeConnections.set(userId, new Set());
      }
      this.activeConnections.get(userId)!.add(socket.id);

      this.setupEnhancedHandlers(socket);

      // Join session room
      socket.on('join-session', (sessionName: string) => {
        socket.join(`session:${sessionName}`);
        logger.info('Client joined session room', {
          sessionName,
          userId,
        });

        const isActive = SessionManager.isSessionActive(sessionName);
        socket.emit('session-status', { sessionName, isActive });
      });

      // Leave session room
      socket.on('leave-session', (sessionName: string) => {
        socket.leave(`session:${sessionName}`);
        logger.info('Client left session room', {
          sessionName,
          userId,
        });
      });

      // Get active sessions
      socket.on('get-active-sessions', () => {
        const activeSessions = SessionManager.getActiveSessions();
        socket.emit('active-sessions', activeSessions);
      });

      // Proper disconnect handling
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          userId,
          socketId: socket.id,
          reason,
        });

        // Clean up presence
        presenceService.setOffline(socket.id);

        // Remove from active connections
        const userConnections = this.activeConnections.get(userId);
        if (userConnections) {
          userConnections.delete(socket.id);
          if (userConnections.size === 0) {
            this.activeConnections.delete(userId);
          }
        }

        // Leave all rooms
        socket.rooms.forEach((room) => {
          socket.leave(room);
        });

        // Remove all listeners
        socket.removeAllListeners();

        // Track analytics event
        if (tenantId) {
          AnalyticsService.trackEvent({
            tenant_id: tenantId,
            event_type: 'user_disconnected',
            event_data: {
              user_id: userId,
              socket_id: socket.id,
              reason,
            },
            timestamp: Date.now(),
          });
        }
      });

      socket.on('error', (error) => {
        logger.error('WebSocket error', {
          error: error.message,
          userId,
          socketId: socket.id,
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
        from: message.from,
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
   * Setup presence service listeners
   */
  private setupPresenceListeners() {
    presenceService.on('presence:online', (data) => {
      this.broadcastToTenant(data.tenant_id, 'presence:update', data);
    });

    presenceService.on('presence:offline', (data) => {
      this.broadcastToTenant(data.tenant_id, 'presence:update', data);
    });

    presenceService.on('presence:status', (data) => {
      this.broadcastToTenant(data.tenant_id, 'presence:update', data);
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
   * Broadcast to specific tenant
   */
  private broadcastToTenant(tenantId: string, event: string, data: any) {
    this.io.to(`tenant:${tenantId}`).emit(event, data);
  }

  /**
   * Enhanced connection handlers with presence and analytics
   */
  private setupEnhancedHandlers(socket: any) {
    const user = socket.data.user;
    const tenantId = user.tenant_id;

    // Join tenant room
    socket.join(`tenant:${tenantId}`);

    // Set user online
    presenceService.setOnline(user.id, tenantId, socket.id, {
      username: user.name,
      email: user.email,
    });

    // Handle status updates
    socket.on('presence:status', (status: 'online' | 'away' | 'busy') => {
      presenceService.updateStatus(user.id, status);
    });

    // Handle typing indicators
    socket.on('typing:start', (data: { session_name: string; chat_id: string }) => {
      socket.to(`session:${data.session_name}`).emit('typing:indicator', {
        user_id: user.id,
        user_name: user.name,
        chat_id: data.chat_id,
        typing: true,
      });
    });

    socket.on('typing:stop', (data: { session_name: string; chat_id: string }) => {
      socket.to(`session:${data.session_name}`).emit('typing:indicator', {
        user_id: user.id,
        user_name: user.name,
        chat_id: data.chat_id,
        typing: false,
      });
    });

    // Handle real-time analytics request
    socket.on('analytics:subscribe', () => {
      socket.join(`analytics:${tenantId}`);

      // Send initial dashboard data
      const metrics = AnalyticsService.getDashboardMetrics(tenantId);
      socket.emit('analytics:dashboard', metrics);
    });

    socket.on('analytics:unsubscribe', () => {
      socket.leave(`analytics:${tenantId}`);
    });

    // Get online users
    socket.on('presence:get-online', () => {
      const onlineUsers = presenceService.getOnlineUsers(tenantId);
      socket.emit('presence:online-users', onlineUsers);
    });
  }

  /**
   * Clean up stale connections
   */
  private cleanupStaleConnections(): void {
    try {
      const connectedSockets = this.io.sockets.sockets;
      let cleaned = 0;

      // Check tracked connections
      for (const [userId, socketIds] of this.activeConnections.entries()) {
        for (const socketId of socketIds) {
          if (!connectedSockets.has(socketId)) {
            socketIds.delete(socketId);
            cleaned++;
          }
        }

        if (socketIds.size === 0) {
          this.activeConnections.delete(userId);
        }
      }

      if (cleaned > 0) {
        logger.info('Cleaned up stale socket connections', { count: cleaned });
      }
    } catch (error: any) {
      logger.error('Error cleaning up stale connections', {
        error: error.message,
      });
    }
  }

  /**
   * Get active connection statistics
   */
  public getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    roomCount: number;
  } {
    const sockets = this.io.sockets.sockets;
    const rooms = this.io.sockets.adapter.rooms;

    return {
      totalConnections: sockets.size,
      uniqueUsers: this.activeConnections.size,
      roomCount: rooms.size,
    };
  }

  /**
   * Broadcast analytics update to tenant
   */
  public broadcastAnalyticsUpdate(tenantId: string): void {
    const metrics = AnalyticsService.getDashboardMetrics(tenantId);
    this.io.to(`analytics:${tenantId}`).emit('analytics:update', metrics);
  }

  /**
   * Close WebSocket server with proper cleanup
   */
  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Closing WebSocket server...');

      // Disconnect all clients gracefully
      const sockets = Array.from(this.io.sockets.sockets.values());

      sockets.forEach((socket) => {
        socket.emit('server-shutdown', { message: 'Server is shutting down' });
        socket.removeAllListeners();
        socket.disconnect(true);
      });

      // Clear tracking
      this.activeConnections.clear();

      // Close server
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