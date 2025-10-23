import Database from 'better-sqlite3';

/**
 * Create an in-memory test database
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');

  // Enable WAL mode and foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create complete test schema with all tables and columns
  db.exec(`
    -- Tenants table
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

    -- Users table (with tenant_id)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'agent' CHECK(role IN ('admin', 'manager', 'agent')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
      tenant_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    -- Sessions table (with tenant_id)
    CREATE TABLE IF NOT EXISTS sessions (
      session_name TEXT PRIMARY KEY,
      phone_number TEXT,
      status TEXT DEFAULT 'disconnected' CHECK(status IN ('connected', 'disconnected', 'qr', 'error')),
      qr_code TEXT,
      tenant_id TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_name TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      from_me INTEGER DEFAULT 0,
      sender_id TEXT,
      type TEXT NOT NULL,
      content TEXT,
      timestamp INTEGER NOT NULL,
      ack INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_name) REFERENCES sessions(session_name)
    );

    -- Contacts table
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      session_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      is_business INTEGER DEFAULT 0,
      profile_pic_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_name) REFERENCES sessions(session_name)
    );

    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      session_name TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      last_message TEXT,
      last_message_timestamp INTEGER,
      unread_count INTEGER DEFAULT 0,
      is_group INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_name) REFERENCES sessions(session_name)
    );

    -- Analytics events table
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

    -- Backups table
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

    -- Webhook logs table
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

    -- Online users table (presence tracking)
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

    -- Session activity table
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

    -- Migrations table
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_tenant_timestamp ON analytics_events(tenant_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_online_users_tenant ON online_users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_session_activity_tenant ON session_activity(tenant_id, timestamp DESC);
  `);

  return db;
}

/**
 * Seed test database with sample data
 */
export function seedTestDatabase(db: Database.Database) {
  // Insert test tenant
  db.prepare(`
    INSERT INTO tenants (id, name, slug, email, plan, max_sessions, max_users, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'test-tenant-id',
    'Test Tenant',
    'test-tenant',
    'tenant@test.com',
    'pro',
    20,
    10,
    'active'
  );

  // Insert test user
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, status, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'test-user-id',
    'test@test.com',
    '$2b$10$testtesttesttesttesttesttesttesttesttesttesttesttesttest',
    'Test User',
    'admin',
    'active',
    'test-tenant-id'
  );

  // Insert test session
  db.prepare(`
    INSERT INTO sessions (session_name, phone_number, status, tenant_id, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'test-session',
    '+5511999999999',
    'connected',
    'test-tenant-id',
    'test-user-id'
  );
}

/**
 * Clean all data from test database
 */
export function cleanTestDatabase(db: Database.Database) {
  const tables = [
    'online_users',
    'session_activity',
    'webhook_logs',
    'analytics_events',
    'backups',
    'conversations',
    'contacts',
    'messages',
    'sessions',
    'users',
    'tenants',
  ];

  tables.forEach((table) => {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
    } catch (error) {
      // Table might not exist
    }
  });
}
