// server.js - Main server file for WPPConnect Multi-Session Manager
const express = require('express');
const wppconnect = require('@wppconnect-team/wppconnect');
const winston = require('winston');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');

// ============================================
// CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3000;
const DB_PATH = './data/whatsapp.db';
const TOKENS_DIR = './tokens';
const LOGS_DIR = './logs';
const UPLOADS_DIR = './uploads';

// Ensure directories exist
[path.dirname(DB_PATH), TOKENS_DIR, LOGS_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_name, chat_id)
  );

  CREATE TABLE IF NOT EXISTS broadcast_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    recipients TEXT NOT NULL,
    message TEXT NOT NULL,
    media_url TEXT,
    status TEXT DEFAULT 'pending',
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    scheduled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(session_name, chat_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(session_name, status);
`);

logger.info('✅ Database initialized');

// ============================================
// SESSION MANAGER
// ============================================
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.qrCodes = new Map();
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
        statusFind: (status, session) => {
          logger.info(`Session ${session} status: ${status}`);
          
          if (status === 'qrReadSuccess') {
            this.qrCodes.delete(sessionName);
          }
          
          const statusMap = {
            'isLogged': 'connected',
            'qrReadSuccess': 'connected',
            'notLogged': 'qr_ready',
            'browserClose': 'disconnected',
            'DISCONNECTED': 'disconnected'
          };
          
          this.updateSessionStatus(sessionName, statusMap[status] || status);
        }
      });

      // Store session
      this.sessions.set(sessionName, client);

      // Get phone number
      try {
        const host = await client.getHost();
        this.updateSessionPhone(sessionName, host.wid.user);
      } catch (err) {
        logger.error(`Error getting host for ${sessionName}:`, err);
      }

      // Setup message listeners
      this.setupListeners(sessionName, client);

      logger.info(`✅ Session ${sessionName} created successfully`);
      return client;

    } catch (error) {
      logger.error(`Error creating session ${sessionName}:`, error);
      throw error;
    }
  }

  setupListeners(sessionName, client) {
    // Message listener
    client.onMessage(async (message) => {
      try {
        // Save message to database
        this.saveMessage(sessionName, message);

        // Update conversation
        this.updateConversation(sessionName, message.from, message.body, message.timestamp);

        // Save contact if new
        if (!message.fromMe) {
          this.saveContact(sessionName, message.from, message.sender?.pushname || message.notifyName);
        }

        logger.info(`Message received in ${sessionName} from ${message.from}`);
      } catch (err) {
        logger.error(`Error handling message in ${sessionName}:`, err);
      }
    });

    // ACK listener (message status updates)
    client.onAck(async (ack) => {
      try {
        const stmt = db.prepare('UPDATE messages SET ack = ? WHERE message_id = ?');
        stmt.run(ack.ack, ack.id._serialized);
      } catch (err) {
        logger.error(`Error updating ACK:`, err);
      }
    });

    // State change listener
    client.onStateChange((state) => {
      logger.info(`${sessionName} state changed: ${state}`);
      
      if (state === 'DISCONNECTED') {
        this.updateSessionStatus(sessionName, 'disconnected');
      } else if (state === 'CONNECTED') {
        this.updateSessionStatus(sessionName, 'connected');
      }
    });
  }

  saveMessage(sessionName, message) {
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO messages 
        (session_name, message_id, chat_id, from_me, sender, body, type, timestamp, ack)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
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
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO contacts (session_name, contact_id, name, phone, is_group)
        VALUES (?, ?, ?, ?, ?)
      `);

      const isGroup = contactId.includes('@g.us');
      const phone = isGroup ? null : contactId.replace('@c.us', '');

      stmt.run(sessionName, contactId, name, phone, isGroup ? 1 : 0);
    } catch (err) {
      logger.error('Error saving contact:', err);
    }
  }

  updateConversation(sessionName, chatId, lastMessage, timestamp) {
    try {
      const stmt = db.prepare(`
        INSERT INTO conversations (session_name, chat_id, last_message, last_message_time, unread_count, updated_at)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(session_name, chat_id) 
        DO UPDATE SET 
          last_message = excluded.last_message,
          last_message_time = excluded.last_message_time,
          unread_count = unread_count + 1,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(sessionName, chatId, lastMessage, timestamp);
    } catch (err) {
      logger.error('Error updating conversation:', err);
    }
  }

  updateSessionStatus(sessionName, status, qrCode = null) {
    try {
      const stmt = db.prepare(`
        INSERT INTO sessions (session_name, status, qr_code, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(session_name) 
        DO UPDATE SET status = excluded.status, qr_code = excluded.qr_code, updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(sessionName, status, qrCode);
    } catch (err) {
      logger.error('Error updating session status:', err);
    }
  }

  updateSessionPhone(sessionName, phoneNumber) {
    try {
      const stmt = db.prepare('UPDATE sessions SET phone_number = ? WHERE session_name = ?');
      stmt.run(phoneNumber, sessionName);
    } catch (err) {
      logger.error('Error updating phone number:', err);
    }
  }

  getSession(sessionName) {
    return this.sessions.get(sessionName);
  }

  async closeSession(sessionName) {
    const client = this.sessions.get(sessionName);
    if (client) {
      await client.close();
      this.sessions.delete(sessionName);
      this.qrCodes.delete(sessionName);
      this.updateSessionStatus(sessionName, 'disconnected');
      logger.info(`Session ${sessionName} closed`);
    }
  }

  getAllSessions() {
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');
    return stmt.all();
  }
}

const sessionManager = new SessionManager();

// ============================================
// EXPRESS APP
// ============================================
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files from public directory

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create new session
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

// Get all sessions
app.get('/sessions', (req, res) => {
  try {
    const sessions = sessionManager.getAllSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    logger.error('Error getting sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session QR code
app.get('/sessions/:sessionName/qr', (req, res) => {
  try {
    const { sessionName } = req.params;
    const qrCode = sessionManager.qrCodes.get(sessionName);
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not available' });
    }

    res.json({ success: true, qrCode });
  } catch (error) {
    logger.error('Error getting QR code:', error);
    res.status(500).json({ error: error.message });
  }
});

// Close session
app.delete('/sessions/:sessionName', async (req, res) => {
  try {
    const { sessionName } = req.params;
    await sessionManager.closeSession(sessionName);
    res.json({ success: true, message: `Session ${sessionName} closed` });
  } catch (error) {
    logger.error('Error closing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send text message
app.post('/sessions/:sessionName/messages', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { to, message } = req.body;

    const client = sessionManager.getSession(sessionName);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await client.sendText(to, message);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversations
app.get('/sessions/:sessionName/conversations', (req, res) => {
  try {
    const { sessionName } = req.params;
    const { status = 'open', limit = 50 } = req.query;

    const stmt = db.prepare(`
      SELECT * FROM conversations 
      WHERE session_name = ? AND status = ?
      ORDER BY last_message_time DESC
      LIMIT ?
    `);

    const conversations = stmt.all(sessionName, status, limit);
    res.json({ success: true, conversations });
  } catch (error) {
    logger.error('Error getting conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a chat
app.get('/sessions/:sessionName/chats/:chatId/messages', (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    const { limit = 50 } = req.query;

    const stmt = db.prepare(`
      SELECT * FROM messages 
      WHERE session_name = ? AND chat_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const messages = stmt.all(sessionName, chatId, limit);
    res.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    logger.error('Error getting messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get contacts
app.get('/sessions/:sessionName/contacts', (req, res) => {
  try {
    const { sessionName } = req.params;
    const { search } = req.query;

    let query = 'SELECT * FROM contacts WHERE session_name = ?';
    let params = [sessionName];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY name ASC';

    const stmt = db.prepare(query);
    const contacts = stmt.all(...params);
    
    res.json({ success: true, contacts });
  } catch (error) {
    logger.error('Error getting contacts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Assign conversation to agent
app.patch('/sessions/:sessionName/conversations/:chatId/assign', (req, res) => {
  try {
    const { sessionName, chatId } = req.params;
    const { agent } = req.body;

    const stmt = db.prepare(`
      UPDATE conversations 
      SET assigned_agent = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `);

    stmt.run(agent, sessionName, chatId);
    res.json({ success: true, message: 'Conversation assigned' });
  } catch (error) {
    logger.error('Error assigning conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark conversation as read
app.post('/sessions/:sessionName/chats/:chatId/read', async (req, res) => {
  try {
    const { sessionName, chatId } = req.params;

    // Update database
    const stmt = db.prepare(`
      UPDATE conversations 
      SET unread_count = 0, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND chat_id = ?
    `);
    stmt.run(sessionName, chatId);

    // Send seen on WhatsApp
    const client = sessionManager.getSession(sessionName);
    if (client) {
      await client.sendSeen(chatId);
    }

    res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    logger.error('Error marking as read:', error);
    res.status(500).json({ error: error.message });
  }
});

// Broadcast message
app.post('/sessions/:sessionName/broadcast', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { recipients, message } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'recipients must be a non-empty array' });
    }

    const client = sessionManager.getSession(sessionName);
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        await client.sendText(recipient, message);
        sentCount++;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        failedCount++;
        logger.error(`Failed to send to ${recipient}:`, err);
      }
    }

    res.json({ 
      success: true, 
      sentCount, 
      failedCount,
      total: recipients.length 
    });
  } catch (error) {
    logger.error('Error broadcasting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  logger.info(`🚀 WPPConnect Server running on port ${PORT}`);
  logger.info(`📊 API Documentation: http://localhost:${PORT}/health`);
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