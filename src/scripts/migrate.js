const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../config/logger');

function runMigrations(database) {
  const targetDb = database || new Database(path.resolve(__dirname, '../../data/database.db'), {
    verbose: console.log,
  });

  logger.info('Running database migrations...');

  // Check if migrations table exists
  const migrationsTableExists = targetDb
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`)
    .get();

  if (!migrationsTableExists) {
    targetDb.exec(`
      CREATE TABLE migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Migration 001: Add multi-tenancy support
  const migration001 = 'add_multi_tenancy_support';
  const migration001Exists = targetDb
    .prepare('SELECT * FROM migrations WHERE name = ?')
    .get(migration001);

  if (!migration001Exists) {
    logger.info('Running migration: add_multi_tenancy_support');

    targetDb.exec(`
      -- Create tenants table
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        plan TEXT DEFAULT 'free' CHECK(plan IN ('free', 'basic', 'pro', 'enterprise')),
        max_sessions INTEGER DEFAULT 1,
        max_users INTEGER DEFAULT 1,
        settings TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'cancelled')),
        trial_ends_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Create sessions table (matches session.model.ts)
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL UNIQUE,
        phone_number TEXT,
        status TEXT NOT NULL,
        qr_code TEXT,
        qr_code_iv TEXT,
        qr_code_auth_tag TEXT,
        token TEXT,
        token_iv TEXT,
        token_auth_tag TEXT,
        auto_reconnect INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create messages table
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        message_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        from_me INTEGER NOT NULL,
        sender TEXT NOT NULL,
        body TEXT,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        ack INTEGER NOT NULL DEFAULT 0,
        tenant_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_name) REFERENCES sessions(session_name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create contacts table
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        name TEXT,
        phone TEXT,
        is_group INTEGER NOT NULL DEFAULT 0,
        tenant_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_name) REFERENCES sessions(session_name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create conversations table
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        last_message TEXT,
        last_message_time INTEGER NOT NULL,
        unread_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        tenant_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_name) REFERENCES sessions(session_name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create analytics_events table
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        session_name TEXT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (session_name) REFERENCES sessions(session_name)
      );

      -- Create backups table
      CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT,
        backup_type TEXT NOT NULL CHECK(backup_type IN ('full', 'incremental', 'manual')),
        file_path TEXT NOT NULL,
        file_size INTEGER,
        status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create webhook_logs table
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        url TEXT NOT NULL,
        payload TEXT,
        response_status INTEGER,
        response_body TEXT,
        attempt INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
      CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_tenant_timestamp ON analytics_events(tenant_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_backups_tenant ON backups(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant ON webhook_logs(tenant_id, created_at DESC);
    `);

    // Record migration
    targetDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration001);
    logger.info('Migration completed: add_multi_tenancy_support');
  }

  // Migration 002: Add real-time presence tracking
  const migration002 = 'add_presence_tracking';
  const migration002Exists = targetDb
    .prepare('SELECT * FROM migrations WHERE name = ?')
    .get(migration002);

  if (!migration002Exists) {
    logger.info('Running migration: add_presence_tracking');

    targetDb.exec(`
      -- Create online_users table
      CREATE TABLE IF NOT EXISTS online_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        socket_id TEXT NOT NULL,
        status TEXT DEFAULT 'online' CHECK(status IN ('online', 'away', 'busy', 'offline')),
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create session_activity table
      CREATE TABLE IF NOT EXISTS session_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        details TEXT,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_name) REFERENCES sessions(session_name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_online_users_user ON online_users(user_id);
      CREATE INDEX IF NOT EXISTS idx_online_users_tenant ON online_users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_session_activity_session ON session_activity(session_name, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_session_activity_tenant ON session_activity(tenant_id, timestamp DESC);
    `);

    // Record migration
    targetDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration002);
    logger.info('Migration completed: add_presence_tracking');
  }

  logger.info('All migrations completed successfully');
  if (!database) targetDb.close();
}

function rollbackMigration(migrationName) {
  logger.warn(`Rolling back migration: ${migrationName}`);
  const targetDb = new Database(path.resolve(__dirname, '../../data/database.db'), {
    verbose: console.log,
  });

  try {
    if (migrationName === 'add_multi_tenancy_support') {
      targetDb.exec(`
        DROP TABLE IF EXISTS webhook_logs;
        DROP TABLE IF EXISTS backups;
        DROP TABLE IF EXISTS analytics_events;
        DROP TABLE IF EXISTS conversations;
        DROP TABLE IF EXISTS contacts;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS tenants;
        -- Note: Cannot drop tenant_id column from sessions due to SQLite limitations
      `);
    } else if (migrationName === 'add_presence_tracking') {
      targetDb.exec(`
        DROP TABLE IF EXISTS session_activity;
        DROP TABLE IF EXISTS online_users;
      `);
    }

    targetDb.prepare('DELETE FROM migrations WHERE name = ?').run(migrationName);
    logger.info(`Migration ${migrationName} rolled back`);
  } catch (error) {
    logger.error(`Failed to rollback migration ${migrationName}:`, error.message);
    throw error;
  } finally {
    targetDb.close();
  }
}

function getMigrations() {
  const targetDb = new Database(path.resolve(__dirname, '../../data/database.db'), {
    verbose: console.log,
  });

  try {
    const migrationsTableExists = targetDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`)
      .get();

    if (!migrationsTableExists) {
      return [];
    }

    return targetDb
      .prepare('SELECT * FROM migrations ORDER BY id')
      .all()
      .map(row => ({
        id: row.id,
        name: row.name,
        executed_at: row.executed_at,
      }));
  } finally {
    targetDb.close();
  }
}

module.exports = { runMigrations, rollbackMigration, getMigrations };