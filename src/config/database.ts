import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from './environment';
import logger from './logger';

// Ensure data directory exists
const dataDir = path.dirname(config.database.path);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(config.database.path, {
  verbose: config.env === 'development' ? logger.debug.bind(logger) : undefined,
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'agent' CHECK(role IN ('admin', 'agent', 'viewer')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Sessions table
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
    token TEXT,
    token_iv TEXT,
    token_auth_tag TEXT,
    auto_reconnect INTEGER DEFAULT 1,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Messages table
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_name) REFERENCES sessions(session_name)
  );

  -- Contacts table
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_name, contact_id),
    FOREIGN KEY (session_name) REFERENCES sessions(session_name)
  );

  -- Conversations table
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
    UNIQUE(session_name, chat_id),
    FOREIGN KEY (session_name) REFERENCES sessions(session_name),
    FOREIGN KEY (assigned_agent) REFERENCES users(id)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_messages_session_chat 
    ON messages(session_name, chat_id, timestamp DESC);
  
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
    ON messages(timestamp DESC);
  
  CREATE INDEX IF NOT EXISTS idx_users_email 
    ON users(email);
  
  CREATE INDEX IF NOT EXISTS idx_sessions_status 
    ON sessions(status);
`);

logger.info('Database initialized successfully');

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  logger.info('Database connection closed');
  process.exit(0);
});

export default db;