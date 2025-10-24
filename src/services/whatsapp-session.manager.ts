import { Whatsapp } from '../api/whatsapp';
import { create } from '../controllers/initializer';
import SessionService from './session.service';
import MessageService from './message.service';
import ContactModel from '../models/contact.model';
import ConversationModel from '../models/conversation.model';
import { TenantModel } from '../models/tenant.model';
import { SessionStatus, CreateMessageDTO, MessageType } from '../types';
import logger from '../config/logger';
import { EventEmitter } from 'events';
import { TokenStore } from '../token-store/types';

interface ActiveSession {
  client: Whatsapp;
  status: SessionStatus;
}

interface DeviceId {
  user?: string;
  _serialized?: string;
}

interface HostDevice {
  id?: DeviceId;
}

interface Message {
  id: string;
  chatId: string | DeviceId;
  from: string;
  fromMe: boolean;
  sender?: { id: string | DeviceId };
  body?: string;
  type: string;
  timestamp?: number;
  ack?: number;
}

interface Contact {
  id: string | DeviceId;
  name?: string;
  pushname?: string;
  isGroup?: boolean;
}

const createDatabaseTokenStore = (): TokenStore => ({
  async getToken(sessionName: string) {
    try {
      const session = SessionService.getByName(sessionName);
      if (session && session.token && session.token_iv && session.token_auth_tag) {
        const sessionWithToken = session as any;
        if (sessionWithToken.decrypted_token) {
          return JSON.parse(sessionWithToken.decrypted_token);
        }
      }
    } catch (error: any) {
      logger.error('Error getting token from database', { sessionName, error });
    }
    return null;
  },

  async listTokens(): Promise<string[]> {
    try {
      const { sessions } = SessionService.getAll({});
      return sessions
        .filter((s: any) => !!(s.token || s.decrypted_token))
        .map((s: any) => s.session_name);
    } catch (error: any) {
      logger.error('Error listing tokens from database', { error });
      return [];
    }
  },

  async setToken(sessionName: string, tokenData: any): Promise<boolean> {
    try {
      SessionService.saveToken(sessionName, JSON.stringify(tokenData));
      logger.debug('Token saved to database', { sessionName });
      return true;
    } catch (error: any) {
      logger.error('Error saving token to database', { sessionName, error });
      return false;
    }
  },

  async removeToken(sessionName: string) {
    try {
      SessionService.saveToken(sessionName, '');
      logger.debug('Token removed from database', { sessionName });
      return true;
    } catch (error: any) {
      logger.error('Error removing token from database', { sessionName, error });
      return false;
    }
  },
});

class WhatsAppSessionManager extends EventEmitter {
  private sessions: Map<string, ActiveSession> = new Map();
  private databaseTokenStore: TokenStore;

  constructor() {
    super();
    this.databaseTokenStore = createDatabaseTokenStore();
    // Start periodic cleanup
    setInterval(() => this.cleanupStaleSessions(), 30 * 60 * 1000); // Every 30 minutes
  }

  /**
   * Check tenant session limit
   */
  private async checkSessionLimit(tenantId: string): Promise<boolean> {
    try {
      const tenant = TenantModel.findById(tenantId);
      if (!tenant) {
        logger.error('Tenant not found for session limit check', { tenantId });
        return false;
      }

      const activeSessions = Array.from(this.sessions.values()).filter(
        (session) => SessionService.getByName(session.client.session)?.tenant_id === tenantId
      ).length;

      if (activeSessions >= tenant.max_sessions) {
        logger.warn('Tenant session limit reached', { tenantId, max_sessions: tenant.max_sessions });
        return false;
      }

      return true;
    } catch (error: any) {
      logger.error('Error checking session limit', { tenantId, error: error.message });
      return false;
    }
  }

  /**
   * Start a WhatsApp session
   */
  async startSession(sessionName: string): Promise<void> {
    if (this.sessions.has(sessionName)) {
      logger.warn('Session already running', { sessionName });
      return;
    }

    const session = SessionService.getByName(sessionName);
    if (!session || !session.tenant_id) {
      logger.error('Session or tenant not found', { sessionName });
      throw new Error('Session or tenant not found');
    }

    // Check tenant session limit
    const canStart = await this.checkSessionLimit(session.tenant_id);
    if (!canStart) {
      logger.error('Cannot start session: tenant session limit reached', { sessionName });
      throw new Error('Tenant session limit reached');
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
        tokenStore: this.databaseTokenStore,
        folderNameToken: './tokens',

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
        const hostDevice = await client.getHostDevice() as HostDevice;
        if (hostDevice?.id?.user) {
          SessionService.updatePhoneNumber(
            sessionName,
            `${hostDevice.id.user}@c.us`
          );
        }
      } catch (error: any) {
        logger.warn('Could not get host device info', { sessionName });
      }

      // Setup message listeners
      this.setupMessageListeners(sessionName, client);

      logger.info('Session started successfully', { sessionName });
      SessionService.updateStatus(sessionName, SessionStatus.CONNECTED);
    } catch (error: any) {
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
    } catch (error: any) {
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
   * Send text message with proper error handling
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

    try {
      const result = await client.sendText(to, message);

      // Save to database with error handling
      try {
        const hostDevice = await client.getHostDevice() as HostDevice;
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
      } catch (dbError: any) {
        // Log but don't throw - message was sent
        logger.error('Failed to save sent message to database', {
          sessionName,
          error: dbError.message,
          stack: dbError.stack,
        });
      }

      return result;
    } catch (error: any) {
      // Proper error logging and re-throw
      logger.error('Failed to send message', {
        sessionName,
        to,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
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
    client.onMessage(async (message: Message) => {
      logger.debug('New message received', {
        sessionName,
        from: message.from,
      });

      try {
        // Convert chatId to string
        const chatId = typeof message.chatId === 'string'
          ? message.chatId
          : message.chatId._serialized || message.from;

        // Save message to database
        const messageData: CreateMessageDTO = {
          sessionName,
          messageId: message.id,
          chatId,
          fromMe: message.fromMe,
          sender: typeof message.sender?.id === 'string'
            ? message.sender.id
            : message.sender?.id.user || message.from,
          body: message.body || '',
          type: message.type as any || MessageType.TEXT,
          timestamp: message.timestamp || Date.now(),
          ack: message.ack || 0,
        };

        MessageService.save(messageData);

        // Update or create conversation
        ConversationModel.upsert({
          sessionName,
          chatId,
          lastMessage: message.body || '',
          lastMessageTime: message.timestamp || Date.now(),
        });

        // Increment unread count if message is not from us
        if (!message.fromMe) {
          ConversationModel.incrementUnread(sessionName, chatId);
        }

        // Save or update contact
        if (!message.fromMe) {
          try {
            const contact = await client.getContact(message.from) as Contact;
            const contactId = typeof contact.id === 'string'
              ? contact.id
              : contact.id._serialized || message.from;
            const phoneNumber = typeof contact.id === 'string'
              ? contact.id
              : contact.id.user || '';

            ContactModel.upsert({
              sessionName,
              contactId,
              name: contact.name || contact.pushname,
              phone: phoneNumber,
              isGroup: contact.isGroup || false,
            });
          } catch (error: any) {
            logger.error('Failed to fetch contact info', {
              sessionName,
              from: message.from,
              error: error.message,
            });
          }
        }

        // Emit event for real-time processing
        this.emit('message', { sessionName, message });
      } catch (error: any) {
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
      } catch (error: any) {
        logger.error('Error updating ACK', {
          sessionName,
          error: error.message,
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
          this.startSession(sessionName).catch((error: any) => {
            logger.error('Auto-reconnect failed', {
              sessionName,
              error: error.message,
            });
          });
        }, 5000);
      }
    } catch (error: any) {
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
          } catch (error: any) {
            logger.error('Failed to auto-start session', {
              sessionName: session.session_name,
              error: error.message,
            });
          }
        }
      }
    } catch (error: any) {
      logger.error('Error initializing sessions', { error: error.message });
    }
  }

  /**
   * Cleanup stale sessions
   */
  private async cleanupStaleSessions(): Promise<void> {
    logger.info('Cleaning up stale sessions...');

    try {
      const sessionNames = Array.from(this.sessions.keys());

      for (const sessionName of sessionNames) {
        const session = SessionService.getByName(sessionName);
        if (!session || !session.tenant_id) continue;

        const tenant = TenantModel.findById(session.tenant_id);
        if (!tenant) {
          await this.stopSession(sessionName);
          continue;
        }

        // Check if tenant has exceeded session limit
        const activeSessions = Array.from(this.sessions.values()).filter(
          (s) => SessionService.getByName(s.client.session)?.tenant_id === session.tenant_id
        ).length;

        if (activeSessions > tenant.max_sessions) {
          logger.warn('Stopping session due to tenant limit', { sessionName, tenantId: session.tenant_id });
          await this.stopSession(sessionName);
        }
      }
    } catch (error: any) {
      logger.error('Error during session cleanup', { error: error.message });
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

    // Clear sessions map
    this.sessions.clear();
  }
}

// Singleton instance
export default new WhatsAppSessionManager();