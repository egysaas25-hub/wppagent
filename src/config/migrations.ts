import db from '../config/database';
import logger from '../config/logger';

/**
 * Database migration system for multi-tenancy support
 */

export function runMigrations(): void {
  logger.info('Running database migrations...');

  // Check if migrations table exists
  const migrationsTableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`)
    .get();

  if (!migrationsTableExists) {
    db.exec(`
      CREATE TABLE migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Migration 001: Add multi-tenancy support
  const migration001 = 'add_multi_tenancy_support';
  const migration001Exists = db
    .prepare('SELECT * FROM migrations WHERE name = ?')
    .get(migration001);

  if (!migration001Exists) {
    logger.info('Running migration: add_multi_tenancy_support');

    db.exec(`
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
        settings TEXT, -- JSON string for tenant-specific settings
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'cancelled')),
        trial_ends_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Add tenant_id to users table
      ALTER TABLE users ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

      -- Add tenant_id to sessions table
      ALTER TABLE sessions ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

      -- Create analytics_events table for tracking
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        session_name TEXT,
        event_type TEXT NOT NULL, -- 'message_sent', 'message_received', 'session_started', etc.
        event_data TEXT, -- JSON string
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (session_name) REFERENCES sessions(session_name)
      );

      -- Create backups table for tracking backups
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

      -- Create webhook_logs table for tenant webhooks
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

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
      CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_tenant_timestamp ON analytics_events(tenant_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_backups_tenant ON backups(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant ON webhook_logs(tenant_id, created_at DESC);
    `);

    // Record migration
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration001);
    logger.info('Migration completed: add_multi_tenancy_support');
  }

  // Migration 002: Add real-time presence tracking
  const migration002 = 'add_presence_tracking';
  const migration002Exists = db
    .prepare('SELECT * FROM migrations WHERE name = ?')
    .get(migration002);

  if (!migration002Exists) {
    logger.info('Running migration: add_presence_tracking');

    db.exec(`
      -- Create online_users table for presence tracking
      CREATE TABLE IF NOT EXISTS online_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        socket_id TEXT NOT NULL,
        status TEXT DEFAULT 'online' CHECK(status IN ('online', 'away', 'busy', 'offline')),
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT, -- JSON string for additional data
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      -- Create session_activity table for session analytics
      CREATE TABLE IF NOT EXISTS session_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        activity_type TEXT NOT NULL, -- 'connected', 'disconnected', 'qr_scanned', 'message_sent', etc.
        details TEXT, -- JSON string
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
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration002);
    logger.info('Migration completed: add_presence_tracking');
  }

  logger.info('All migrations completed successfully');
}

/**
 * Rollback last migration (use with caution)
 */
export function rollbackMigration(migrationName: string): void {
  logger.warn(`Rolling back migration: ${migrationName}`);

  // This is a destructive operation and should be used carefully
  // Implementation depends on specific migration requirements

  db.prepare('DELETE FROM migrations WHERE name = ?').run(migrationName);
  logger.info(`Migration ${migrationName} rolled back`);
}

/**
 * Get list of executed migrations
 */
export function getMigrations(): Array<{ id: number; name: string; executed_at: string }> {
  const migrationsTableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`)
    .get();

  if (!migrationsTableExists) {
    return [];
  }

  return db.prepare('SELECT * FROM migrations ORDER BY id').all() as Array<{
    id: number;
    name: string;
    executed_at: string;
  }>;
}
