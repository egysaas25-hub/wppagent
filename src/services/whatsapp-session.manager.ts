import { Whatsapp } from '../api/whatsapp';
import { create } from '../controllers/initializer';
import SessionService from './session.service';
import MessageService from './message.service';
import { SessionStatus, CreateMessageDTO, MessageType } from '../types';
import logger from '../config/logger';
import { EventEmitter } from 'events';
import { TokenStore } from '../token-store/types';

interface ActiveSession {
  client: Whatsapp;
  status: SessionStatus;
}

// Custom database token store
const createDatabaseTokenStore = (): TokenStore => ({
  async getToken(sessionName: string) {
    try {
      const session = SessionService.getByName(sessionName);
      if (session?.decrypted_token) {
        return JSON.parse(session.decrypted_token);
      }
    } catch (error) {
      logger.error('Error getting token from database', { sessionName, error });
    }
    return null;
  },

  async saveToken(sessionName: string, tokenData: any) {
    try {
      SessionService.saveToken(sessionName, JSON.stringify(tokenData));
      logger.debug('Token saved to database', { sessionName });
    } catch (error) {
      logger.error('Error saving token to database', { sessionName, error });
    }
  },

  async removeToken(sessionName: string) {
    try {
      // Set token fields to null
      SessionService.saveToken(sessionName, '');
      logger.debug('Token removed from database', { sessionName });
    } catch (error) {
      logger.error('Error removing token from database', { sessionName, error });
    }
  },
});

class WhatsAppSessionManager extends EventEmitter {
  private sessions: Map<string, ActiveSession> = new Map();
  private databaseTokenStore: TokenStore;

  constructor() {
    super();
    this.databaseTokenStore = createDatabaseTokenStore();
  }

  /**
   * Start a WhatsApp session
   */
  async startSession(sessionName: string): Promise<void> {
    if (this.sessions.has(sessionName)) {
      logger.warn('Session already running', { sessionName });
      return;
    }

    logger.info('Starting WhatsApp session', { sessionName });

    try {
      // Update status to connecting
      SessionService.updateStatus(sessionName, SessionStatus.CONNECTING);

      // Create WPPConnect client with database token store
      const client = await create({
        session: sessionName,
        headless: true,
        devtools: false,
        useChrome: true,
        logQR: false,
        tokenStore: this.databaseTokenStore, // ← Use database instead of files
        folderNameToken: './tokens', // Still needed for browser profiles
        
        // QR Code callback
        catchQR: (base64Qr, asciiQR, attempt, urlCode) => {
          logger.info('QR Code received', { sessionName, attempt });
          
          // Save QR to database
          SessionService.saveQRCode(sessionName, base64Qr);
          SessionService.updateStatus(sessionName, SessionStatus.QR_CODE);
          
          // Emit event for WebSocket broadcasting
          this.emit('qr', { sessionName, qr: base64Qr, attempt });
        },

        // Status callback
        statusFind: (status, session) => {
          logger.info('Status changed', { sessionName, status });
          
          switch (status) {
            case 'autocloseCalled':
            case 'desconnectedMobile':
            case 'serverClose':
            case 'browserClose':
              this.handleDisconnection(sessionName);
              break;
            case 'qrReadSuccess':
            case 'isLogged':
              SessionService.updateStatus(sessionName, SessionStatus.CONNECTED);
              this.emit('connected', { sessionName });
              break;
          }
          
          this.emit('status', { sessionName, status });
        },

        // Loading screen callback
        onLoadingScreen: (percent, message) => {
          logger.debug('Loading', { sessionName, percent, message });
          this.emit('loading', { sessionName, percent, message });
        },
      });

      // Store active session
      this.sessions.set(sessionName, {
        client,
        status: SessionStatus.CONNECTED,
      });

      // Get and save phone number
      try {
        const hostDevice = await client.getHostDevice();
        if (hostDevice?.id?.user) {
          SessionService.updatePhoneNumber(
            sessionName,
            `${hostDevice.id.user}@c.us`
          );
        }
      } catch (error) {
        logger.warn('Could not get host device info', { sessionName });
      }

      // Setup message listeners
      this.setupMessageListeners(sessionName, client);

      logger.info('Session started successfully', { sessionName });
      SessionService.updateStatus(sessionName, SessionStatus.CONNECTED);
    } catch (error) {
      logger.error('Failed to start session', {
        sessionName,
        error: error.message,
        stack: error.stack,
      });
      SessionService.updateStatus(sessionName, SessionStatus.ERROR);
      throw error;
    }
  }

  /**
   * Stop a WhatsApp session
   */
  async stopSession(sessionName: string): Promise<void> {
    const session = this.sessions.get(sessionName);
    
    if (!session) {
      logger.warn('Session not found', { sessionName });
      return;
    }

    logger.info('Stopping session', { sessionName });

    try {
      await session.client.close();
      this.sessions.delete(sessionName);
      SessionService.updateStatus(sessionName, SessionStatus.DISCONNECTED);
      
      logger.info('Session stopped', { sessionName });
    } catch (error) {
      logger.error('Error stopping session', {
        sessionName,
        error: error.message,
      });
    }
  }

  /**
   * Get active session
   */
  getSession(sessionName: string): Whatsapp | null {
    return this.sessions.get(sessionName)?.client || null;
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionName: string): boolean {
    return this.sessions.has(sessionName);
  }

  /**
   * Send text message
   */
  async sendMessage(
    sessionName: string,
    to: string,
    message: string
  ): Promise<any> {
    const client = this.getSession(sessionName);
    
    if (!client) {
      throw new Error('Session not active');
    }

    logger.info('Sending message', { sessionName, to });

    const result = await client.sendText(to, message);

    // Save to database
    try {
      const hostDevice = await client.getHostDevice();
      const messageData: CreateMessageDTO = {
        sessionName,
        messageId: result.id,
        chatId: to,
        fromMe: true,
        sender: hostDevice?.id?.user || '',
        body: message,
        type: MessageType.TEXT,
        timestamp: result.t || Date.now(),
        ack: result.ack || 0,
      };

      MessageService.save(messageData);
    } catch (error) {
      logger.error('Failed to save sent message to database', { 
        sessionName, 
        error: error.message 
      });
    }

    return result;
  }

  /**
   * Send file message
   */
  async sendFile(
    sessionName: string,
    to: string,
    base64: string,
    filename: string,
    caption?: string
  ): Promise<any> {
    const client = this.getSession(sessionName);
    
    if (!client) {
      throw new Error('Session not active');
    }

    logger.info('Sending file', { sessionName, to, filename });

    return await client.sendFile(to, base64, filename, caption);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Setup message listeners
   */
  private setupMessageListeners(sessionName: string, client: Whatsapp): void {
    // Listen for new messages
    client.onMessage(async (message) => {
      logger.debug('New message received', {
        sessionName,
        from: message.from,
      });

      try {
        // Save to database
        const messageData: CreateMessageDTO = {
          sessionName,
          messageId: message.id,
          chatId: message.chatId,
          fromMe: message.fromMe,
          sender: message.sender?.id || message.from,
          body: message.body || '',
          type: (message.type as MessageType) || MessageType.TEXT,
          timestamp: message.timestamp || Date.now(),
          ack: message.ack || 0,
        };

        MessageService.save(messageData);

        // Emit event for real-time processing
        this.emit('message', { sessionName, message });
      } catch (error) {
        logger.error('Error saving message', {
          sessionName,
          error: error.message,
        });
      }
    });

    // Listen for ACK updates
    client.onAck(async (msg) => {
      try {
        MessageService.updateAck(msg.id, msg.ack);
        this.emit('ack', { sessionName, messageId: msg.id, ack: msg.ack });
      } catch (error) {
        logger.error('Error updating ACK', { 
          sessionName, 
          error: error.message 
        });
      }
    });

    // Listen for state changes
    client.onStateChange((state) => {
      logger.info('State changed', { sessionName, state });
      this.emit('stateChange', { sessionName, state });
    });
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(sessionName: string): void {
    logger.warn('Session disconnected', { sessionName });
    
    this.sessions.delete(sessionName);
    SessionService.updateStatus(sessionName, SessionStatus.DISCONNECTED);
    
    this.emit('disconnected', { sessionName });

    // Auto-reconnect logic
    try {
      const session = SessionService.getByName(sessionName);
      if (session?.auto_reconnect) {
        logger.info('Auto-reconnect enabled, restarting session', { sessionName });
        
        setTimeout(() => {
          this.startSession(sessionName).catch((error) => {
            logger.error('Auto-reconnect failed', {
              sessionName,
              error: error.message,
            });
          });
        }, 5000);
      }
    } catch (error) {
      logger.error('Error in disconnection handler', {
        sessionName,
        error: error.message,
      });
    }
  }

  /**
   * Initialize sessions on startup
   */
  async initializeSessions(): Promise<void> {
    logger.info('Initializing existing sessions...');

    try {
      // Get all sessions with auto_reconnect enabled
      const { sessions } = SessionService.getAll({});

      for (const session of sessions) {
        if (session.auto_reconnect) {
          logger.info('Auto-starting session', {
            sessionName: session.session_name,
          });
          
          // Reset status first
          SessionService.updateStatus(
            session.session_name, 
            SessionStatus.DISCONNECTED
          );
          
          // Start session
          try {
            await this.startSession(session.session_name);
          } catch (error) {
            logger.error('Failed to auto-start session', {
              sessionName: session.session_name,
              error: error.message,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error initializing sessions', { error: error.message });
    }
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up all sessions...');
    
    const sessionNames = Array.from(this.sessions.keys());
    
    for (const sessionName of sessionNames) {
      await this.stopSession(sessionName);
    }
  }
}

// Singleton instance
export default new WhatsAppSessionManager();