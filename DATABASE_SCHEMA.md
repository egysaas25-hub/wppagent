# Database Schema Documentation

This document provides a comprehensive overview of the WPPConnect database schema, including entity relationships, table structures, indexes, and migration strategies.

---

## Table of Contents

- [Overview](#overview)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Core Tables](#core-tables)
- [Multi-Tenancy Tables](#multi-tenancy-tables)
- [Analytics Tables](#analytics-tables)
- [System Tables](#system-tables)
- [Indexes](#indexes)
- [Constraints](#constraints)
- [Migrations](#migrations)
- [Query Patterns](#query-patterns)

---

## Overview

### Database Technology

- **Development**: SQLite 3.x
- **Production**: PostgreSQL 12+ (recommended) or SQLite
- **ORM**: None (using raw SQL with better-sqlite3)
- **Migrations**: Custom migration system

### Design Principles

1. **Multi-tenant**: All user data is scoped by `tenant_id`
2. **Normalization**: Tables are normalized to 3NF
3. **Performance**: Strategic use of indexes and denormalization
4. **Audit Trail**: Timestamps on all records
5. **Soft Deletes**: Where applicable, records are marked as deleted

---

## Entity Relationship Diagram

### High-Level ERD

```
┌─────────────────────────────────────────────────────────────────────┐
│                     WPPConnect Database Schema                       │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   tenants    │
│──────────────│
│ id (PK)      │◄────────────┐
│ name         │              │
│ slug (UK)    │              │
│ plan         │              │
│ max_sessions │              │
│ settings     │              │
└──────────────┘              │
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        │                     │                     │
┌───────▼──────┐      ┌───────▼──────┐      ┌──────▼───────┐
│    users     │      │  sessions    │      │   backups    │
│──────────────│      │──────────────│      │──────────────│
│ id (PK)      │      │ session_name │      │ id (PK)      │
│ email (UK)   │      │ (PK)         │      │ tenant_id(FK)│
│ tenant_id(FK)│◄──┐  │ phone_number │      │ backup_type  │
│ role         │   │  │ status       │      │ file_path    │
│ status       │   │  │ tenant_id(FK)│◄──┐  │ file_size    │
└──────────────┘   │  │ created_by   │   │  └──────────────┘
                   │  │ (FK)         │   │
                   │  └──────────────┘   │
                   │          │          │
                   └──────────┘          │
                              │          │
        ┌─────────────────────┼──────────┼─────────────────┐
        │                     │          │                 │
┌───────▼──────┐      ┌───────▼──────┐  │  ┌──────────────▼─────┐
│  messages    │      │  contacts    │  │  │ analytics_events   │
│──────────────│      │──────────────│  │  │────────────────────│
│ id (PK)      │      │ id (PK)      │  │  │ id (PK)            │
│ session_name │      │ session_name │  │  │ tenant_id (FK)     │
│ (FK)         │      │ (FK)         │  │  │ session_name (FK)  │
│ chat_id      │      │ phone        │  │  │ event_type         │
│ from_me      │      │ name         │  │  │ event_data         │
│ content      │      │ is_business  │  │  │ timestamp          │
│ timestamp    │      └──────────────┘  │  └────────────────────┘
└──────────────┘                        │
        │                               │
┌───────▼──────────┐            ┌───────▼──────────┐
│ conversations    │            │ session_activity │
│──────────────────│            │──────────────────│
│ id (PK)          │            │ id (PK)          │
│ session_name(FK) │            │ session_name(FK) │
│ chat_id          │            │ tenant_id (FK)   │
│ last_message     │            │ activity_type    │
│ unread_count     │            │ details          │
└──────────────────┘            │ timestamp        │
                                └──────────────────┘

┌──────────────────┐            ┌──────────────────┐
│  online_users    │            │  webhook_logs    │
│──────────────────│            │──────────────────│
│ id (PK)          │            │ id (PK)          │
│ user_id (FK)     │            │ tenant_id (FK)   │
│ tenant_id (FK)   │            │ event_type       │
│ socket_id        │            │ url              │
│ status           │            │ payload          │
│ last_seen        │            │ status           │
└──────────────────┘            └──────────────────┘
```

### Relationship Legend

- `(PK)` = Primary Key
- `(FK)` = Foreign Key
- `(UK)` = Unique Key
- `◄──` = One-to-Many Relationship

---

## Core Tables

### users

Stores user accounts for the system.

```sql
CREATE TABLE users (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | NO | UUID primary key |
| `email` | TEXT | NO | User email (unique) |
| `password_hash` | TEXT | NO | bcrypt hashed password |
| `name` | TEXT | NO | User full name |
| `role` | TEXT | NO | User role: admin, manager, agent |
| `status` | TEXT | NO | Account status: active, inactive, suspended |
| `tenant_id` | TEXT | YES | Associated tenant (for multi-tenancy) |
| `created_at` | DATETIME | NO | Record creation timestamp |
| `updated_at` | DATETIME | NO | Last update timestamp |

**Indexes:**
- `idx_users_email` ON `email`
- `idx_users_tenant` ON `tenant_id`
- `idx_users_status` ON `status`

**Relationships:**
- Belongs to: `tenants` (many-to-one)
- Has many: `sessions` (one-to-many)

---

### sessions

Stores WhatsApp session information.

```sql
CREATE TABLE sessions (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `session_name` | TEXT | NO | Unique session identifier |
| `phone_number` | TEXT | YES | WhatsApp phone number |
| `status` | TEXT | NO | Connection status |
| `qr_code` | TEXT | YES | Base64 encoded QR code |
| `tenant_id` | TEXT | YES | Associated tenant |
| `created_by` | TEXT | YES | User who created session |
| `created_at` | DATETIME | NO | Creation timestamp |
| `updated_at` | DATETIME | NO | Last update timestamp |

**Indexes:**
- `idx_sessions_tenant` ON `tenant_id`
- `idx_sessions_status` ON `status`
- `idx_sessions_created_by` ON `created_by`

**Relationships:**
- Belongs to: `tenants` (many-to-one)
- Belongs to: `users` (created_by, many-to-one)
- Has many: `messages` (one-to-many)
- Has many: `contacts` (one-to-many)
- Has many: `conversations` (one-to-many)

---

### messages

Stores WhatsApp messages.

```sql
CREATE TABLE messages (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | NO | Message ID from WhatsApp |
| `session_name` | TEXT | NO | Associated session |
| `chat_id` | TEXT | NO | Chat/conversation ID |
| `from_me` | INTEGER | NO | 1 if sent by us, 0 if received |
| `sender_id` | TEXT | YES | Sender WhatsApp ID |
| `type` | TEXT | NO | Message type (text, image, video, etc.) |
| `content` | TEXT | YES | Message content (text or media URL) |
| `timestamp` | INTEGER | NO | Unix timestamp |
| `ack` | INTEGER | NO | Acknowledgment status (0-5) |
| `created_at` | DATETIME | NO | Record creation timestamp |

**Indexes:**
- `idx_messages_session` ON `session_name`
- `idx_messages_chat` ON `chat_id`
- `idx_messages_timestamp` ON `timestamp DESC`

**Acknowledgment Status:**
- `0` = Pending
- `1` = Sent to server
- `2` = Delivered to recipient
- `3` = Read by recipient
- `4` = Played (for voice messages)

---

### contacts

Stores WhatsApp contacts.

```sql
CREATE TABLE contacts (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | NO | Contact ID (phone@c.us) |
| `session_name` | TEXT | NO | Associated session |
| `phone` | TEXT | NO | Phone number |
| `name` | TEXT | YES | Contact name |
| `is_business` | INTEGER | NO | 1 if business account |
| `profile_pic_url` | TEXT | YES | Profile picture URL |
| `created_at` | DATETIME | NO | Creation timestamp |
| `updated_at` | DATETIME | NO | Last update timestamp |

**Indexes:**
- `idx_contacts_session` ON `session_name`
- `idx_contacts_phone` ON `phone`

---

### conversations

Stores chat/conversation metadata.

```sql
CREATE TABLE conversations (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | NO | Unique conversation ID |
| `session_name` | TEXT | NO | Associated session |
| `chat_id` | TEXT | NO | Chat identifier |
| `last_message` | TEXT | YES | Last message preview |
| `last_message_timestamp` | INTEGER | YES | Unix timestamp of last message |
| `unread_count` | INTEGER | NO | Number of unread messages |
| `is_group` | INTEGER | NO | 1 if group chat |
| `created_at` | DATETIME | NO | Creation timestamp |
| `updated_at` | DATETIME | NO | Last update timestamp |

**Indexes:**
- `idx_conversations_session` ON `session_name`
- `idx_conversations_last_message` ON `last_message_timestamp DESC`

---

## Multi-Tenancy Tables

### tenants

Stores tenant/organization information.

```sql
CREATE TABLE tenants (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | NO | UUID primary key |
| `name` | TEXT | NO | Tenant/organization name |
| `slug` | TEXT | NO | URL-safe unique identifier |
| `email` | TEXT | NO | Contact email |
| `phone` | TEXT | YES | Contact phone |
| `plan` | TEXT | NO | Subscription plan |
| `max_sessions` | INTEGER | NO | Maximum allowed sessions |
| `max_users` | INTEGER | NO | Maximum allowed users |
| `settings` | TEXT | YES | JSON string of tenant settings |
| `status` | TEXT | NO | Tenant status |
| `trial_ends_at` | DATETIME | YES | Trial period end date |
| `created_at` | DATETIME | NO | Creation timestamp |
| `updated_at` | DATETIME | NO | Last update timestamp |

**Indexes:**
- `idx_tenants_slug` ON `slug`
- `idx_tenants_status` ON `status`

**Subscription Plans:**

| Plan | Max Sessions | Max Users | Features |
|------|--------------|-----------|----------|
| `free` | 1 | 1 | Basic features |
| `basic` | 5 | 5 | + Analytics |
| `pro` | 20 | 10 | + Webhooks, Priority Support |
| `enterprise` | Unlimited | Unlimited | + SLA, Custom Features |

---

## Analytics Tables

### analytics_events

Stores analytics events for tracking.

```sql
CREATE TABLE analytics_events (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Auto-increment primary key |
| `tenant_id` | TEXT | NO | Associated tenant |
| `session_name` | TEXT | YES | Associated session (optional) |
| `event_type` | TEXT | NO | Type of event |
| `event_data` | TEXT | YES | JSON event payload |
| `timestamp` | INTEGER | NO | Unix timestamp |
| `created_at` | DATETIME | NO | Record creation timestamp |

**Indexes:**
- `idx_analytics_tenant_timestamp` ON `tenant_id, timestamp DESC`
- `idx_analytics_event_type` ON `event_type`
- `idx_analytics_session` ON `session_name`

**Event Types:**
- `message_sent`
- `message_received`
- `session_started`
- `session_stopped`
- `qr_scanned`
- `user_login`
- `api_call`

---

### session_activity

Stores session activity logs.

```sql
CREATE TABLE session_activity (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Auto-increment primary key |
| `session_name` | TEXT | NO | Associated session |
| `tenant_id` | TEXT | NO | Associated tenant |
| `activity_type` | TEXT | NO | Type of activity |
| `details` | TEXT | YES | JSON activity details |
| `timestamp` | INTEGER | NO | Unix timestamp |
| `created_at` | DATETIME | NO | Record creation timestamp |

**Indexes:**
- `idx_session_activity_session` ON `session_name, timestamp DESC`
- `idx_session_activity_tenant` ON `tenant_id, timestamp DESC`

**Activity Types:**
- `connected`
- `disconnected`
- `qr_generated`
- `message_sent`
- `error_occurred`

---

## System Tables

### backups

Stores backup metadata.

```sql
CREATE TABLE backups (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Auto-increment primary key |
| `tenant_id` | TEXT | YES | Tenant (NULL for full backup) |
| `backup_type` | TEXT | NO | Type of backup |
| `file_path` | TEXT | NO | Path to backup file |
| `file_size` | INTEGER | YES | File size in bytes |
| `status` | TEXT | NO | Backup status |
| `error_message` | TEXT | YES | Error message if failed |
| `created_at` | DATETIME | NO | Backup timestamp |

**Indexes:**
- `idx_backups_tenant` ON `tenant_id, created_at DESC`
- `idx_backups_status` ON `status`

---

### webhook_logs

Stores webhook delivery logs.

```sql
CREATE TABLE webhook_logs (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Auto-increment primary key |
| `tenant_id` | TEXT | NO | Associated tenant |
| `event_type` | TEXT | NO | Webhook event type |
| `url` | TEXT | NO | Webhook URL |
| `payload` | TEXT | YES | JSON payload sent |
| `response_status` | INTEGER | YES | HTTP response status |
| `response_body` | TEXT | YES | Response body |
| `attempt` | INTEGER | NO | Delivery attempt number |
| `status` | TEXT | NO | Delivery status |
| `created_at` | DATETIME | NO | Log timestamp |

**Indexes:**
- `idx_webhook_logs_tenant` ON `tenant_id, created_at DESC`
- `idx_webhook_logs_status` ON `status`

---

### online_users

Stores real-time presence information.

```sql
CREATE TABLE online_users (
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
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Auto-increment primary key |
| `user_id` | TEXT | NO | Associated user |
| `tenant_id` | TEXT | NO | Associated tenant |
| `socket_id` | TEXT | NO | WebSocket connection ID |
| `status` | TEXT | NO | Presence status |
| `last_seen` | DATETIME | NO | Last activity timestamp |
| `metadata` | TEXT | YES | JSON metadata |
| `created_at` | DATETIME | NO | Connection timestamp |

**Indexes:**
- `idx_online_users_user` ON `user_id`
- `idx_online_users_tenant` ON `tenant_id`
- `idx_online_users_socket` ON `socket_id`

---

### migrations

Tracks applied database migrations.

```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Columns:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Auto-increment primary key |
| `name` | TEXT | NO | Migration name (unique) |
| `executed_at` | DATETIME | NO | Execution timestamp |

---

## Indexes

### Index Strategy

**Primary Indexes (created with tables):**
- All primary keys are automatically indexed
- Unique constraints create indexes

**Secondary Indexes:**

```sql
-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_status ON users(status);

-- Sessions
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_by ON sessions(created_by);

-- Messages
CREATE INDEX idx_messages_session ON messages(session_name);
CREATE INDEX idx_messages_chat ON messages(chat_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);

-- Contacts
CREATE INDEX idx_contacts_session ON contacts(session_name);
CREATE INDEX idx_contacts_phone ON contacts(phone);

-- Conversations
CREATE INDEX idx_conversations_session ON conversations(session_name);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_timestamp DESC);

-- Tenants
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

-- Analytics Events
CREATE INDEX idx_analytics_tenant_timestamp ON analytics_events(tenant_id, timestamp DESC);
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_session ON analytics_events(session_name);

-- Session Activity
CREATE INDEX idx_session_activity_session ON session_activity(session_name, timestamp DESC);
CREATE INDEX idx_session_activity_tenant ON session_activity(tenant_id, timestamp DESC);

-- Backups
CREATE INDEX idx_backups_tenant ON backups(tenant_id, created_at DESC);
CREATE INDEX idx_backups_status ON backups(status);

-- Webhook Logs
CREATE INDEX idx_webhook_logs_tenant ON webhook_logs(tenant_id, created_at DESC);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);

-- Online Users
CREATE INDEX idx_online_users_user ON online_users(user_id);
CREATE INDEX idx_online_users_tenant ON online_users(tenant_id);
CREATE INDEX idx_online_users_socket ON online_users(socket_id);
```

---

## Constraints

### Foreign Key Constraints

All foreign key relationships enforce referential integrity:

```sql
-- Example: sessions table
FOREIGN KEY (created_by) REFERENCES users(id);
FOREIGN KEY (tenant_id) REFERENCES tenants(id);
```

**Note**: SQLite foreign keys must be enabled:
```sql
PRAGMA foreign_keys = ON;
```

### Check Constraints

Enforce valid enum values:

```sql
-- Users
CHECK(role IN ('admin', 'manager', 'agent'))
CHECK(status IN ('active', 'inactive', 'suspended'))

-- Sessions
CHECK(status IN ('connected', 'disconnected', 'qr', 'error'))

-- Tenants
CHECK(plan IN ('free', 'basic', 'pro', 'enterprise'))
CHECK(status IN ('active', 'suspended', 'cancelled'))

-- Backups
CHECK(backup_type IN ('full', 'incremental', 'manual'))
CHECK(status IN ('pending', 'in_progress', 'completed', 'failed'))
```

### Unique Constraints

```sql
-- Users
UNIQUE (email)

-- Tenants
UNIQUE (slug)

-- Migrations
UNIQUE (name)
```

---

## Migrations

### Migration System

The application uses a custom migration system defined in `src/config/migrations.ts`.

**Migration Structure:**

```typescript
export function runMigrations(database?: Database.Database): void {
  const db = database || defaultDb;

  // Check if migrations table exists
  createMigrationsTable(db);

  // Run each migration
  runMigration001(db); // Multi-tenancy support
  runMigration002(db); // Presence tracking
  // ... additional migrations
}
```

### Current Migrations

**Migration 001: Multi-tenancy Support**
- Creates `tenants` table
- Adds `tenant_id` to `users` and `sessions`
- Creates `analytics_events` table
- Creates `backups` table
- Creates `webhook_logs` table
- Creates indexes for performance

**Migration 002: Presence Tracking**
- Creates `online_users` table
- Creates `session_activity` table
- Creates indexes for real-time queries

### Running Migrations

```bash
# Migrations run automatically on application start
npm start

# Or manually via code
import { runMigrations } from './config/migrations';
runMigrations();
```

---

## Query Patterns

### Common Query Patterns

**1. Get User with Tenant:**

```sql
SELECT u.*, t.name as tenant_name, t.plan
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
WHERE u.id = ?;
```

**2. Get Sessions for Tenant:**

```sql
SELECT s.*, u.name as created_by_name
FROM sessions s
LEFT JOIN users u ON s.created_by = u.id
WHERE s.tenant_id = ?
ORDER BY s.created_at DESC;
```

**3. Get Messages with Pagination:**

```sql
SELECT * FROM messages
WHERE session_name = ?
  AND timestamp < ?
ORDER BY timestamp DESC
LIMIT 50;
```

**4. Get Analytics Dashboard:**

```sql
-- Total messages
SELECT COUNT(*) as total
FROM messages m
JOIN sessions s ON m.session_name = s.session_name
WHERE s.tenant_id = ?;

-- Messages by hour
SELECT
  strftime('%Y-%m-%d %H:00', datetime(timestamp, 'unixepoch')) as hour,
  COUNT(*) as count
FROM messages m
JOIN sessions s ON m.session_name = s.session_name
WHERE s.tenant_id = ?
  AND timestamp > ?
GROUP BY hour
ORDER BY hour DESC;
```

**5. Check Tenant Quota:**

```sql
SELECT
  t.max_sessions,
  COUNT(s.session_name) as current_sessions
FROM tenants t
LEFT JOIN sessions s ON t.id = s.tenant_id
WHERE t.id = ?
GROUP BY t.id;
```

### Performance Tips

1. **Use Prepared Statements**: Faster and safer
   ```typescript
   const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
   const user = stmt.get(userId);
   ```

2. **Batch Inserts**: Use transactions for multiple inserts
   ```typescript
   const insert = db.prepare('INSERT INTO messages VALUES (?, ?, ?)');
   db.transaction(() => {
     messages.forEach(msg => insert.run(msg.id, msg.session, msg.content));
   })();
   ```

3. **Index Usage**: Ensure WHERE clauses use indexed columns

4. **Limit Results**: Always use LIMIT for large result sets

5. **Avoid N+1 Queries**: Use JOINs instead of multiple queries

---

## Schema Migration Guide

### Adding a New Table

1. Create migration in `src/config/migrations.ts`:

```typescript
const migration003 = 'add_notifications_table';
const migration003Exists = db.prepare('SELECT * FROM migrations WHERE name = ?').get(migration003);

if (!migration003Exists) {
  logger.info('Running migration: add_notifications_table');

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
  `);

  db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration003);
  logger.info('Migration completed: add_notifications_table');
}
```

2. Create model in `src/models/notification.model.ts`

3. Add to documentation

### Modifying Existing Table

SQLite doesn't support ALTER TABLE DROP COLUMN, so use this pattern:

```typescript
// 1. Create new table with desired schema
db.exec(`CREATE TABLE users_new (...)`);

// 2. Copy data
db.exec(`INSERT INTO users_new SELECT ... FROM users`);

// 3. Drop old table
db.exec(`DROP TABLE users`);

// 4. Rename new table
db.exec(`ALTER TABLE users_new RENAME TO users`);

// 5. Recreate indexes
db.exec(`CREATE INDEX ...`);
```

---

**Document Version**: 1.0
**Last Updated**: 2024
**Author**: WPPConnect Team
