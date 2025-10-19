// ultimate-server.js - Complete feature set
const express = require('express');
const wppconnect = require('@wppconnect-team/wppconnect');
const winston = require('winston');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');
const { Parser } = require('json2csv');

// ============================================
// CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3000;
const DB_PATH = './data/whatsapp.db';
const TOKENS_DIR = './tokens';
const LOGS_DIR = './logs';
const UPLOADS_DIR = './uploads';
const EXPORTS_DIR = './exports';

// Ensure directories exist
[path.dirname(DB_PATH), TOKENS_DIR, LOGS_DIR, UPLOADS_DIR, EXPORTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============================================
// FILE UPLOAD CONFIGURATION
// ============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ============================================
// LOGGER SETUP
// ============================================
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(LOGS_DIR, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(LOGS_DIR, 'combined.log') }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ============================================
// DATABASE SETUP
// ============================================
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create all tables
db.exec(`
  -- Existing tables (from enhanced-server.js)
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
    auto_reconnect INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    is_group INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 1,
    tags TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_name, contact_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    message_id TEXT UNIQUE,
    chat_id TEXT NOT NULL,
    from_me INTEGER DEFAULT 0,
    sender TEXT,
    body TEXT,
    type TEXT,
    timestamp INTEGER,
    ack INTEGER DEFAULT 0,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    last_message TEXT,
    last_message_time INTEGER,
    unread_count INTEGER DEFAULT 0,
    assigned_agent TEXT,
    tags TEXT,
    status TEXT DEFAULT 'open',
    rating INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_name, chat_id)
  );

  CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_name, name)
  );

  CREATE TABLE IF NOT EXISTS auto_responder_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    keyword TEXT NOT NULL,
    response TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    match_type TEXT DEFAULT 'contains',
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    recipient TEXT NOT NULL,
    message TEXT NOT NULL,
    media_path TEXT,
    scheduled_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS business_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    open_time TEXT NOT NULL,
    close_time TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    UNIQUE(session_name, day_of_week)
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,
    UNIQUE(session_name, setting_key)
  );

  -- NEW: Analytics & Metrics
  CREATE TABLE IF NOT EXISTS analytics_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    date DATE NOT NULL,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    conversations_started INTEGER DEFAULT 0,
    conversations_closed INTEGER DEFAULT 0,
    unique_contacts INTEGER DEFAULT 0,
    avg_response_time_seconds INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_name, date)
  );

  -- NEW: Agents & Team Management
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'agent',
    status TEXT DEFAULT 'offline',
    max_conversations INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_name, email)
  );

  -- NEW: Conversation Transfer History
  CREATE TABLE IF NOT EXISTS transfer_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    from_agent TEXT,
    to_agent TEXT NOT NULL,
    reason TEXT,
    transferred_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Internal Notes
  CREATE TABLE IF NOT EXISTS conversation_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    agent_email TEXT NOT NULL,
    note TEXT NOT NULL,
    is_private INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Webhooks
  CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    secret TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    response_code INTEGER,
    success INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: CRM Integration
  CREATE TABLE IF NOT EXISTS crm_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    crm_type TEXT NOT NULL,
    crm_contact_id TEXT NOT NULL,
    last_synced DATETIME,
    UNIQUE(session_name, contact_id, crm_type)
  );

  -- NEW: Multi-Channel Support
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_type TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    session_name TEXT NOT NULL,
    config TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_type, channel_id)
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(session_name, chat_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(session_name, status);
  CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_daily(session_name, date);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(session_name, status);
  CREATE INDEX IF NOT EXISTS idx_webhook_logs ON webhook_logs(webhook_id, created_at);
`);

logger.info('✅ Database initialized with all tables');

// ============================================
// WEBSOCKET SETUP (Real-time Notifications)
// ============================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  socket.on('subscribe', (sessionName) => {
    socket.join(`session_${sessionName}`);
    logger.info(`Client ${socket.id} subscribed to ${sessionName}`);
  });
});

// ============================================
// ANALYTICS HELPER
// ============================================
class Analytics {
  static updateDaily(sessionName) {
    const today = new Date().toISOString().split('T')[0];
    
    // Messages sent today
    const messagesSent = db.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE session_name = ? AND from_me = 1 
      AND date(created_at) = ?
    `).get(sessionName, today).count;

    // Messages received today
    const messagesReceived = db.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE session_name = ? AND from_me = 0 
      AND date(created_at) = ?
    `).get(sessionName, today).count;

    // Conversations started today
    const conversationsStarted = db.prepare(`
      SELECT COUNT(*) as count FROM conversations 
      WHERE session_name = ? AND date(created_at) = ?
    `).get(sessionName, today).count;

    // Unique contacts today
    const uniqueContacts = db.prepare(`
      SELECT COUNT(DISTINCT chat_id) as count FROM messages 
      WHERE session_name = ? AND date(created_at) = ?
    `).get(sessionName, today).count;

    // Update or insert
    db.prepare(`
      INSERT INTO analytics_daily 
      (session_name, date, messages_sent, messages_received, conversations_started, unique_contacts)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_name, date) 
      DO UPDATE SET 
        messages_sent = excluded.messages_sent,
        messages_received = excluded.messages_received,
        conversations_started = excluded.conversations_started,
        unique_contacts = excluded.unique_contacts
    `).run(sessionName, today, messagesSent, messagesReceived, conversationsStarted, uniqueContacts);
  }

  static getMetrics(sessionName, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    return db.prepare(`
      SELECT * FROM analytics_daily 
      WHERE session_name = ? AND date >= ?
      ORDER BY date DESC
    `).all(sessionName, startDateStr);
  }

  static getSummary(sessionName) {
    const totalMessages = db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE session_name = ?
    `).get(sessionName).count;

    const totalContacts = db.prepare(`
      SELECT COUNT(*) as count FROM contacts WHERE session_name = ?
    `).get(sessionName).count;

    const activeConversations = db.prepare(`
      SELECT COUNT(*) as count FROM conversations 
      WHERE session_name = ? AND status = 'open'
    `).get(sessionName).count;

    const avgResponseTime = db.prepare(`
      SELECT AVG(avg_response_time_seconds) as avg 
      FROM analytics_daily 
      WHERE session_name = ? AND avg_response_time_seconds > 0
    `).get(sessionName).avg || 0;

    return {
      totalMessages,
      totalContacts,
      activeConversations,
      avgResponseTime: Math.round(avgResponseTime)
    };
  }
}

// ============================================
// WEBHOOK HELPER
// ============================================
class WebhookManager {
  static async trigger(sessionName, eventType, data) {
    const webhooks = db.prepare(`
      SELECT * FROM webhooks 
      WHERE session_name = ? AND enabled = 1
    `).all(sessionName);

    for (const webhook of webhooks) {
      const events = JSON.parse(webhook.events);
      
      if (events.includes(eventType) || events.includes('*')) {
        try {
          const payload = {
            event: eventType,
            session: sessionName,
            timestamp: new Date().toISOString(),
            data: data
          };

          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Secret': webhook.secret || '',
              'X-Event-Type': eventType
            },
            body: JSON.stringify(payload)
          });

          // Log webhook call
          db.prepare(`
            INSERT INTO webhook_logs 
            (webhook_id, event_type, payload, response_code, success)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            webhook.id,
            eventType,
            JSON.stringify(payload),
            response.status,
            response.ok ? 1 : 0
          );

          logger.info(`Webhook triggered: ${eventType} → ${webhook.url} (${response.status})`);
        } catch (error) {
          logger.error(`Webhook error: ${webhook.url}`, error);
          
          db.prepare(`
            INSERT INTO webhook_logs 
            (webhook_id, event_type, payload, response_code, success)
            VALUES (?, ?, ?, ?, 0)
          `).run(webhook.id, eventType, JSON.stringify(data), 0);
        }
      }
    }
  }
}

// ============================================
// AGENT HELPER
// ============================================
class AgentManager {
  static assignToAvailableAgent(sessionName, chatId) {
    // Get agents sorted by current workload
    const agent = db.prepare(`
      SELECT a.email, a.name, 
             COUNT(c.id) as current_conversations
      FROM agents a
      LEFT JOIN conversations c 
        ON a.email = c.assigned_agent 
        AND c.session_name = ? 
        AND c.status = 'open'
      WHERE a.session_name = ? 
        AND a.status = 'online'
      GROUP BY a.email
      HAVING current_conversations < a.max_conversations
      ORDER BY current_conversations ASC
      LIMIT 1
    `).get(sessionName, sessionName);

    if (agent) {
      db.prepare(`
        UPDATE conversations 
        SET assigned_agent = ?, updated_at = CURRENT_TIMESTAMP
        WHERE session_name = ? AND chat_id = ?
      `).run(agent.email, sessionName, chatId);

      logger.info(`Auto-assigned ${chatId} to ${agent.email}`);
      return agent;
    }

    return null;
  }

  static getAgentStats(sessionName, agentEmail) {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_conversations,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END) as avg_rating
      FROM conversations
      WHERE session_name = ? AND assigned_agent = ?
    `).get(sessionName, agentEmail);

    return stats;
  }
}

// ============================================
// CRM INTEGRATION HELPER
// ============================================
class CRMIntegration {
  static async syncContact(sessionName, contactId, crmType, crmData) {
    // This is a template - you'd implement specific CRM APIs
    try {
      const contact = db.prepare(`
        SELECT * FROM contacts 
        WHERE session_name = ? AND contact_id = ?
      `).get(sessionName, contactId);

      // Example: Sync to generic CRM
      // In production, implement specific CRM integrations (Salesforce, HubSpot, etc.)
      
      const crmContactId = crmData.id || `whatsapp_${contactId}`;
      
      db.prepare(`
        INSERT INTO crm_mappings 
        (session_name, contact_id, crm_type, crm_contact_id, last_synced)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(session_name, contact_id, crm_type)
        DO UPDATE SET crm_contact_id = excluded.crm_contact_id, 
                      last_synced = CURRENT_TIMESTAMP
      `).run(sessionName, contactId, crmType, crmContactId);

      logger.info(`Synced ${contactId} to ${crmType} CRM`);
      return { success: true, crmContactId };
    } catch (error) {
      logger.error(`CRM sync error:`, error);
      return { success: false, error: error.message };
    }
  }
}

// ============================================
// SESSION MANAGER (Enhanced)
// ============================================
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.qrCodes = new Map();
    this.reconnectAttempts = new Map();
  }

  async createSession(sessionName) {
    if (this.sessions.has(sessionName)) {
      throw new Error('Session already exists');
    }

    logger.info(`Creating session: ${sessionName}`);

    try {
      const client = await wppconnect.create({
        session: sessionName,
        headless: true,
        devtools: false,
        useChrome: false,
        logQR: false,
        disableWelcome: true,
        updatesLog: false,
        autoClose: 0,
        folderNameToken: TOKENS_DIR,
        puppeteerOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ],
          pipe: true
        },
        catchQR: (base64Qr, asciiQR, attempts) => {
          this.qrCodes.set(sessionName, base64Qr);
          this.updateSessionStatus(sessionName, 'qr_ready', base64Qr);
          logger.info(`QR Code generated for ${sessionName} (Attempt ${attempts})`);
        },
        statusFind: async (status, session) => {
          logger.info(`Session ${session} status: ${status}`);
          
          if (status === 'qrReadSuccess' || status === 'isLogged') {
            this.qrCodes.delete(sessionName);
            this.reconnectAttempts.delete(sessionName);
            
            // Trigger webhook
            await WebhookManager.trigger(sessionName, 'session.connected', {
              sessionName,
              status: 'connected'
            });

            // Real-time notification
            io.to(`session_${sessionName}`).emit('session_status', {
              sessionName,
              status: 'connected'
            });
          }
          
          const statusMap = {
            'isLogged': 'connected',
            'qrReadSuccess': 'connected',
            'notLogged': 'qr_ready',
            'browserClose': 'disconnected',
            'DISCONNECTED': 'disconnected',
            'desconnectedMobile': 'disconnected'
          };
          
          this.updateSessionStatus(sessionName, statusMap[status] || status);

          if (status === 'DISCONNECTED' || status === 'desconnectedMobile') {
            await WebhookManager.trigger(sessionName, 'session.disconnected', {
              sessionName
            });
            this.scheduleReconnect(sessionName);
          }
        }
      });

      this.sessions.set(sessionName, client);

      try {
        const host = await client.getHost();
        this.updateSessionPhone(sessionName, host.wid.user);
      } catch (err) {
        logger.error(`Error getting host for ${sessionName}:`, err);
      }

      this.setupListeners(sessionName, client);
      this.createDefaultData(sessionName);

      logger.info(`✅ Session ${sessionName} created successfully`);
      return client;

    } catch (error) {
      logger.error(`Error creating session ${sessionName}:`, error);
      throw error;
    }
  }

  setupListeners(sessionName, client) {
    // Message listener (enhanced with webhooks & analytics)
    client.onMessage(async (message) => {
      try {
        // Save message
        this.saveMessage(sessionName, message);

        // Update conversation
        this.updateConversation(sessionName, message.from, message.body, message.timestamp);

        if (!message.fromMe) {
          // Save/update contact
          const isNew = this.saveContact(sessionName, message.from, message.sender?.pushname || message.notifyName);

          // Real-time notification
          io.to(`session_${sessionName}`).emit('new_message', {
            sessionName,
            from: message.from,
            body: message.body,
            timestamp: message.timestamp,
            isNew
          });

          // Trigger webhook
          await WebhookManager.trigger(sessionName, 'message.received', {
            from: message.from,
            body: message.body,
            type: message.type,
            timestamp: message.timestamp
          });

          // Auto-assign to agent if needed
          const conv = db.prepare(`
            SELECT assigned_agent FROM conversations 
            WHERE session_name = ? AND chat_id = ?
          `).get(sessionName, message.from);

          if (!conv || !conv.assigned_agent) {
            const agent = AgentManager.assignToAvailableAgent(sessionName, message.from);
            
            if (agent) {
              io.to(`session_${sessionName}`).emit('conversation_assigned', {
                chatId: message.from,
                agent: agent.email
              });
            }
          }
        }

        // Update analytics
        Analytics.updateDaily(sessionName);

        logger.info(`Message received in ${sessionName} from ${message.from}`);
      } catch (err) {
        logger.error(`Error handling message in ${sessionName}:`, err);
      }
    });

    client.onAck(async (ack) => {
      try {
        db.prepare('UPDATE messages SET ack = ? WHERE message_id = ?')
          .run(ack.ack, ack.id._serialized);
      } catch (err) {
        logger.error(`Error updating ACK:`, err);
      }
    });

    client.onStateChange(async (state) => {
      logger.info(`${sessionName} state changed: ${state}`);
      
      io.to(`session_${sessionName}`).emit('state_change', {
        sessionName,
        state
      });

      if (state === 'DISCONNECTED') {
        this.updateSessionStatus(sessionName, 'disconnected');
        this.scheduleReconnect(sessionName);
      } else if (state === 'CONNECTED') {
        this.updateSessionStatus(sessionName, 'connected');
      }
    });
  }

  createDefaultData(sessionName) {
    // Create default templates
    const defaultTemplates = [
      { name: 'greeting', content: '👋 Hello! How can I help you?', category: 'general' },
      { name: 'thanks', content: 'Thank you for contacting us!', category: 'general' }
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO message_templates (session_name, name, content, category)
      VALUES (?, ?, ?, ?)
    `);

    defaultTemplates.forEach(t => stmt.run(sessionName, t.name, t.content, t.category));

    // Set default business hours (Mon-Fri 9-5)
    const days = [1, 2, 3, 4, 5];
    const hoursStmt = db.prepare(`
      INSERT OR IGNORE INTO business_hours (session_name, day_of_week, open_time, close_time)
      VALUES (?, ?, '09:00', '17:00')
    `);

    days.forEach(day => hoursStmt.run(sessionName, day));
  }

  saveMessage(sessionName, message) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO messages 
        (session_name, message_id, chat_id, from_me, sender, body, type, timestamp, ack)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionName,
        message.id?._serialized || message.id,
        message.from,
        message.fromMe ? 1 : 0,
        message.sender?.id || message.from,
        message.body || '',
        message.type || 'chat',
        message.timestamp || Date.now(),
        message.ack || 0
      );
    } catch (err) {
      logger.error('Error saving message:', err);
    }
  }

  saveContact(sessionName, contactId, name) {
    try {
      const existing = db.prepare(`
        SELECT is_new FROM contacts 
        WHERE session_name = ? AND contact_id = ?
      `).get(sessionName, contactId);

      if (existing) {
        return existing.is_new === 1;
      }

      db.prepare(`
        INSERT INTO contacts (session_name, contact_id, name, phone, is_group, is_new)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(sessionName, contactId, name, contactId.replace('@c.us', ''), contactId.includes('@g.us') ? 1 : 0);
      
      return true;
    } catch (err) {
      logger.error('Error saving contact:', err);
      return false;
    }
  }

  updateConversation(sessionName, chatId, lastMessage, timestamp) {
    try {
      db.prepare(`
        INSERT INTO conversations (session_name, chat_id, last_message, last_message_time, unread_count, updated_at)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(session_name, chat_id) 
        DO UPDATE SET 
          last_message = excluded.last_message,
          last_message_time = excluded.last_message_time,
          unread_count = unread_count + 1,
          updated_at = CURRENT_TIMESTAMP
      `).run(sessionName, chatId, lastMessage, timestamp);
    } catch (err) {
      logger.error('Error updating conversation:', err);
    }
  }

  updateSessionStatus(sessionName, status, qrCode = null) {
    try {
      db.prepare(`
        INSERT INTO sessions (session_name, status, qr_code, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(session_name) 
        DO UPDATE SET status = excluded.status, qr_code = excluded.qr_code, updated_at = CURRENT_TIMESTAMP
      `).run(sessionName, status, qrCode);
    } catch (err) {
      logger.error('Error updating session status:', err);
    }
  }

  updateSessionPhone(sessionName, phoneNumber) {
    try {
      db.prepare('UPDATE sessions SET phone_number = ? WHERE session_name = ?')
        .run(phoneNumber, sessionName);
    } catch (err) {
      logger.error('Error updating phone number:', err);
    }
  }

  scheduleReconnect(sessionName) {
    const autoReconnect = db.prepare(`
      SELECT auto_reconnect FROM sessions WHERE session_name = ?
    `).get(sessionName);

    if (!autoReconnect || autoReconnect.auto_reconnect !== 1) {
      logger.info(`Auto-reconnect disabled for ${sessionName}`);
      return;
    }

    const attempts = this.reconnectAttempts.get(sessionName) || 0;
    
    if (attempts >= 5) {
      logger.error(`Max reconnection attempts reached for ${sessionName}`);
      return;
    }

    const delay = Math.min(30000 * Math.pow(2, attempts), 300000);
    
    logger.info(`Scheduling reconnect for ${sessionName} in ${delay/1000}s`);

    setTimeout(async () => {
      try {
        this.reconnectAttempts.set(sessionName, attempts + 1);
        await this.closeSession(sessionName);
        await this.createSession(sessionName);
        logger.info(`✅ Reconnected ${sessionName}`);
      } catch (error) {
        logger.error(`Failed to reconnect ${sessionName}:`, error);
      }
    }, delay);
  }

  getSession(sessionName) {
    return this.sessions.get(sessionName);
  }

  async closeSession(sessionName) {
    const client = this.sessions.get(sessionName);
    if (client) {
      try {
        await client.close();
      } catch (err) {
        logger.error(`Error closing ${sessionName}:`, err);
      }
      this.sessions.delete(sessionName);
      this.qrCodes.delete(sessionName);
      this.updateSessionStatus(sessionName, 'disconnected');
      logger.info(`Session ${sessionName} closed`);
    }
  }

  getAllSessions() {
    return db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
  }
}

const sessionManager = new SessionManager();

// ============================================
// EXPRESS APP
// ============================================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// ============================================
// SESSION ROUTES (Basic - from enhanced-server.js)
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/sessions', async (req, res) => {
  try {
    const { sessionName } = req.body;
    if (!sessionName) {
      return res.status(400).json({ error: 'sessionName is required' });
    }
    await sessionManager.createSession(sessionName);
    res.json({ success: true, message: `Session ${sessionName} created`, sessionName });
  } catch (error) {
    logger.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions', (req, res) => {
  try {
    const sessions = sessionManager.getAllSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/qr', (req, res) => {
  try {
    const { sessionName } = req.params;
    const qrCode = sessionManager.qrCodes.get(sessionName);
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not available' });
    }
    res.json({ success: true, qrCode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/sessions/:sessionName', async (req, res) => {
  try {
    const { sessionName } = req.params;
    await sessionManager.closeSession(sessionName);
    res.json({ success: true, message: `Session ${sessionName} closed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ANALYTICS ROUTES (Week 3)
// ============================================

app.get('/sessions/:sessionName/analytics/summary', (req, res) => {
  try {
    const { sessionName } = req.params;
    const summary = Analytics.getSummary(sessionName);
    res.json({ success: true, ...summary });
  } catch (error) {
    logger.error('Error getting analytics summary:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/analytics/daily', (req, res) => {
  try {
    const { sessionName } = req.params;
    const { days = 30 } = req.query;
    const metrics = Analytics.getMetrics(sessionName, parseInt(days));
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Error getting daily metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/analytics/agent-performance', (req, res) => {
  try {
    const { sessionName } = req.params;
    
    const agents = db.prepare(`
      SELECT a.email, a.name, a.status,
        COUNT(CASE WHEN c.status = 'open' THEN 1 END) as active_conversations,
        COUNT(CASE WHEN c.status = 'closed' THEN 1 END) as closed_conversations,
        AVG(CASE WHEN c.rating IS NOT NULL THEN c.rating END) as avg_rating
      FROM agents a
      LEFT JOIN conversations c ON a.email = c.assigned_agent AND c.session_name = ?
      WHERE a.session_name = ?
      GROUP BY a.email
    `).all(sessionName, sessionName);

    res.json({ success: true, agents });
  } catch (error) {
    logger.error('Error getting agent performance:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// EXPORT ROUTES (Week 3)
// ============================================

app.get('/sessions/:sessionName/export/conversations', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { format = 'csv' } = req.query;

    const conversations = db.prepare(`
      SELECT c.*, co.name as contact_name, co.phone
      FROM conversations c
      LEFT JOIN contacts co ON c.chat_id = co.contact_id AND c.session_name = co.session_name
      WHERE c.session_name = ?
      ORDER BY c.last_message_time DESC
    `).all(sessionName);

    if (format === 'csv') {
      const parser = new Parser({
        fields: ['chat_id', 'contact_name', 'phone', 'last_message', 'assigned_agent', 'status', 'rating']
      });
      const csv = parser.parse(conversations);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=conversations-${sessionName}-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({ success: true, conversations });
    }
  } catch (error) {
    logger.error('Error exporting conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/export/messages', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { chatId, format = 'csv' } = req.query;

    let query = 'SELECT * FROM messages WHERE session_name = ?';
    const params = [sessionName];

    if (chatId) {
      query += ' AND chat_id = ?';
      params.push(chatId);
    }

    query += ' ORDER BY timestamp DESC';

    const messages = db.prepare(query).all(...params);

    if (format === 'csv') {
      const parser = new Parser({
        fields: ['chat_id', 'sender', 'body', 'type', 'timestamp', 'from_me']
      });
      const csv = parser.parse(messages);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=messages-${sessionName}-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({ success: true, messages });
    }
  } catch (error) {
    logger.error('Error exporting messages:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/export/contacts', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { format = 'csv' } = req.query;

    const contacts = db.prepare(`
      SELECT * FROM contacts WHERE session_name = ? ORDER BY name
    `).all(sessionName);

    if (format === 'csv') {
      const parser = new Parser({
        fields: ['name', 'phone', 'contact_id', 'tags', 'notes', 'created_at']
      });
      const csv = parser.parse(contacts);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=contacts-${sessionName}-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({ success: true, contacts });
    }
  } catch (error) {
    logger.error('Error exporting contacts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AGENT ROUTES (Week 4)
// ============================================

app.get('/sessions/:sessionName/agents', (req, res) => {
  try {
    const { sessionName } = req.params;
    const agents = db.prepare(`
      SELECT * FROM agents WHERE session_name = ? ORDER BY name
    `).all(sessionName);
    res.json({ success: true, agents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sessions/:sessionName/agents', (req, res) => {
  try {
    const { sessionName } = req.params;
    const { email, name, role, maxConversations } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'email and name are required' });
    }

    db.prepare(`
      INSERT INTO agents (session_name, email, name, role, max_conversations)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionName, email, name, role || 'agent', maxConversations || 5);

    res.json({ success: true, message: 'Agent created' });
  } catch (error) {
    logger.error('Error creating agent:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/sessions/:sessionName/agents/:email/status', (req, res) => {
  try {
    const { sessionName, email } = req.params;
    const { status } = req.body;

    db.prepare(`
      UPDATE agents SET status = ? WHERE session_name = ? AND email = ?
    `).run(status, sessionName, email);

    res.json({ success: true, message: 'Agent status updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/agents/:email/stats', (req, res) => {
  try {
    const { sessionName, email } = req.params;
    const stats = AgentManager.getAgentStats(sessionName, email);
    res.json({ success: true, ...stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONVERSATION TRANSFER (Week 4)
// ============================================

app.post('/sessions/:sessionName/conversations/:chatId/transfer', async (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    const { toAgent, fromAgent, reason } = req.body;

    if (!toAgent) {
      return res.status(400).json({ error: 'toAgent is required' });
    }

    // Update conversation
    db.prepare(`
      UPDATE conversations 
      SET assigned_agent = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `).run(toAgent, sessionName, chatId);

    // Log transfer
    db.prepare(`
      INSERT INTO transfer_history (session_name, chat_id, from_agent, to_agent, reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionName, chatId, fromAgent, toAgent, reason);

    // Real-time notification
    io.to(`session_${sessionName}`).emit('conversation_transferred', {
      chatId,
      fromAgent,
      toAgent,
      reason
    });

    // Send notification to customer
    const client = sessionManager.getSession(sessionName);
    if (client) {
      await client.sendText(chatId, 
        `You've been transferred to ${toAgent}. They'll assist you shortly.`
      );
    }

    res.json({ success: true, message: 'Conversation transferred' });
  } catch (error) {
    logger.error('Error transferring conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/conversations/:chatId/transfer-history', (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    
    const history = db.prepare(`
      SELECT * FROM transfer_history 
      WHERE session_name = ? AND chat_id = ?
      ORDER BY transferred_at DESC
    `).all(sessionName, chatId);

    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// INTERNAL NOTES (Week 4)
// ============================================

app.get('/sessions/:sessionName/conversations/:chatId/notes', (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    
    const notes = db.prepare(`
      SELECT * FROM conversation_notes 
      WHERE session_name = ? AND chat_id = ?
      ORDER BY created_at DESC
    `).all(sessionName, chatId);

    res.json({ success: true, notes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sessions/:sessionName/conversations/:chatId/notes', (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    const { agentEmail, note, isPrivate } = req.body;

    if (!agentEmail || !note) {
      return res.status(400).json({ error: 'agentEmail and note are required' });
    }

    db.prepare(`
      INSERT INTO conversation_notes (session_name, chat_id, agent_email, note, is_private)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionName, chatId, agentEmail, note, isPrivate ? 1 : 0);

    res.json({ success: true, message: 'Note added' });
  } catch (error) {
    logger.error('Error adding note:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOKS (Month 2)
// ============================================

app.get('/sessions/:sessionName/webhooks', (req, res) => {
  try {
    const { sessionName } = req.params;
    const webhooks = db.prepare(`
      SELECT * FROM webhooks WHERE session_name = ? ORDER BY created_at DESC
    `).all(sessionName);
    res.json({ success: true, webhooks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sessions/:sessionName/webhooks', (req, res) => {
  try {
    const { sessionName } = req.params;
    const { url, events, secret } = req.body;

    if (!url || !events) {
      return res.status(400).json({ error: 'url and events are required' });
    }

    const result = db.prepare(`
      INSERT INTO webhooks (session_name, url, events, secret)
      VALUES (?, ?, ?, ?)
    `).run(sessionName, url, JSON.stringify(events), secret);

    res.json({ success: true, webhookId: result.lastInsertRowid });
  } catch (error) {
    logger.error('Error creating webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/sessions/:sessionName/webhooks/:webhookId', (req, res) => {
  try {
    const { sessionName, webhookId } = req.params;
    
    db.prepare(`
      DELETE FROM webhooks WHERE id = ? AND session_name = ?
    `).run(webhookId, sessionName);

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/webhooks/:webhookId/logs', (req, res) => {
  try {
    const { webhookId } = req.params;
    const { limit = 50 } = req.query;
    
    const logs = db.prepare(`
      SELECT * FROM webhook_logs 
      WHERE webhook_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(webhookId, limit);

    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test webhook
app.post('/sessions/:sessionName/webhooks/:webhookId/test', async (req, res) => {
  try {
    const { sessionName, webhookId } = req.params;
    
    const webhook = db.prepare(`
      SELECT * FROM webhooks WHERE id = ? AND session_name = ?
    `).get(webhookId, sessionName);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    await WebhookManager.trigger(sessionName, 'test', {
      message: 'This is a test webhook'
    });

    res.json({ success: true, message: 'Test webhook sent' });
  } catch (error) {
    logger.error('Error testing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CRM INTEGRATION (Month 2)
// ============================================

app.get('/sessions/:sessionName/crm/mappings', (req, res) => {
  try {
    const { sessionName } = req.params;
    
    const mappings = db.prepare(`
      SELECT cm.*, c.name as contact_name, c.phone
      FROM crm_mappings cm
      LEFT JOIN contacts c ON cm.contact_id = c.contact_id AND cm.session_name = c.session_name
      WHERE cm.session_name = ?
    `).all(sessionName);

    res.json({ success: true, mappings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sessions/:sessionName/crm/sync', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { contactId, crmType, crmData } = req.body;

    if (!contactId || !crmType) {
      return res.status(400).json({ error: 'contactId and crmType are required' });
    }

    const result = await CRMIntegration.syncContact(sessionName, contactId, crmType, crmData);
    res.json({ success: result.success, ...result });
  } catch (error) {
    logger.error('Error syncing to CRM:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk sync all contacts to CRM
app.post('/sessions/:sessionName/crm/sync-all', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { crmType } = req.body;

    const contacts = db.prepare(`
      SELECT * FROM contacts WHERE session_name = ?
    `).all(sessionName);

    let synced = 0;
    let failed = 0;

    for (const contact of contacts) {
      try {
        await CRMIntegration.syncContact(sessionName, contact.contact_id, crmType, {
          name: contact.name,
          phone: contact.phone
        });
        synced++;
      } catch (error) {
        failed++;
        logger.error(`Failed to sync ${contact.contact_id}:`, error);
      }
    }

    res.json({ success: true, synced, failed, total: contacts.length });
  } catch (error) {
    logger.error('Error bulk syncing to CRM:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MESSAGING ROUTES (Basic)
// ============================================

app.post('/sessions/:sessionName/messages', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { to, message } = req.body;

    const client = sessionManager.getSession(sessionName);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await client.sendText(to, message);
    
    // Trigger webhook
    await WebhookManager.trigger(sessionName, 'message.sent', {
      to,
      message,
      result
    });

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/sessions/:sessionName/send-file', upload.single('file'), async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { to, caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const client = sessionManager.getSession(sessionName);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await client.sendFile(to, req.file.path, req.file.originalname, caption || '');
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error sending file:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/conversations', (req, res) => {
  try {
    const { sessionName } = req.params;
    const { status = 'open', limit = 50 } = req.query;

    const conversations = db.prepare(`
      SELECT * FROM conversations 
      WHERE session_name = ? AND status = ?
      ORDER BY last_message_time DESC
      LIMIT ?
    `).all(sessionName, status, limit);

    res.json({ success: true, conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/sessions/:sessionName/chats/:chatId/messages', (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    const { limit = 50 } = req.query;

    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE session_name = ? AND chat_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(sessionName, chatId, limit);

    res.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
  logger.info(`🚀 Ultimate WPPConnect Server running on port ${PORT}`);
  logger.info(`📊 Features: Analytics, Webhooks, Teams, CRM, Real-time Notifications`);
  logger.info(`🌐 Dashboard: http://localhost:${PORT}`);
  logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  for (const [sessionName] of sessionManager.sessions) {
    await sessionManager.closeSession(sessionName);
  }
  
  db.close();
  process.exit(0);
});