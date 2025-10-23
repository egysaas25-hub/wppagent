# Advanced Features Documentation

This document describes the advanced features implemented in the WhatsApp Agent application, including multi-tenancy support, real-time WebSocket improvements, advanced analytics, and backup & disaster recovery.

## Table of Contents

1. [Multi-Tenancy Support](#multi-tenancy-support)
2. [Real-Time WebSocket Improvements](#real-time-websocket-improvements)
3. [Advanced Analytics Dashboard](#advanced-analytics-dashboard)
4. [Backup & Disaster Recovery](#backup--disaster-recovery)

---

## Multi-Tenancy Support

The application now supports multiple tenants (organizations/companies) with complete data isolation and resource management.

### Tenant Plans

| Plan | Max Sessions | Max Users | Features |
|------|-------------|-----------|----------|
| Free | 1 | 1 | Basic features |
| Basic | 5 | 3 | Standard features |
| Pro | 20 | 10 | Advanced features |
| Enterprise | Unlimited | Unlimited | All features + priority support |

### API Endpoints

#### Create Tenant
```http
POST /api/v1/tenants
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "name": "Company Name",
  "slug": "company-slug",
  "email": "contact@company.com",
  "phone": "+1234567890",
  "plan": "pro",
  "settings": {
    "webhook_url": "https://example.com/webhook",
    "timezone": "America/New_York"
  }
}
```

#### List Tenants
```http
GET /api/v1/tenants?page=1&limit=20&status=active
Authorization: Bearer {admin_token}
```

#### Get Tenant Details
```http
GET /api/v1/tenants/{tenant_id}
Authorization: Bearer {admin_token}
```

#### Update Tenant
```http
PATCH /api/v1/tenants/{tenant_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "plan": "enterprise",
  "max_sessions": -1,
  "status": "active"
}
```

#### Get Tenant Statistics
```http
GET /api/v1/tenants/{tenant_id}/stats
Authorization: Bearer {admin_token}
```

Response:
```json
{
  "success": true,
  "data": {
    "users_count": 10,
    "sessions_count": 15,
    "messages_count": 5432,
    "active_sessions": 8
  }
}
```

### Tenant Identification

The system supports multiple methods for tenant identification:

1. **HTTP Header**: `X-Tenant-ID` or `X-Tenant-Slug`
2. **Subdomain**: `{tenant-slug}.yourdomain.com`
3. **User Context**: Automatically from authenticated user's `tenant_id`

### Middleware Usage

```typescript
import { tenantContext, requireTenant, requirePlan, filterByTenant } from './middleware/tenant.middleware';

// Apply tenant context to all routes
router.use(tenantContext);

// Require tenant for specific routes
router.get('/dashboard', requireTenant, (req, res) => {
  // Access tenant via req.tenant
  console.log(req.tenant.id, req.tenant.name);
});

// Require specific plan
router.post('/advanced-feature', requirePlan('pro', 'enterprise'), (req, res) => {
  // Only pro and enterprise users can access
});

// Automatically filter data by tenant
router.get('/data', filterByTenant, (req, res) => {
  // req.query.tenant_id is automatically set
});
```

### Data Isolation

All tenant data is completely isolated:

- Users belong to specific tenants
- Sessions are tenant-scoped
- Messages, contacts, and conversations are tenant-specific
- Analytics and backups are per-tenant

---

## Real-Time WebSocket Improvements

Enhanced WebSocket features with presence tracking, typing indicators, and real-time analytics.

### Connection

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});
```

### Presence Tracking

#### Set User Status
```javascript
// Status: 'online', 'away', 'busy'
socket.emit('presence:status', 'online');
```

#### Get Online Users
```javascript
socket.emit('presence:get-online');

socket.on('presence:online-users', (users) => {
  console.log('Online users:', users);
  // [{user_id, tenant_id, status, last_seen, metadata}]
});
```

#### Listen for Presence Updates
```javascript
socket.on('presence:update', (data) => {
  console.log('Presence update:', data);
  // {user_id, tenant_id, status, socket_id}
});
```

### Typing Indicators

```javascript
// Start typing
socket.emit('typing:start', {
  session_name: 'my-session',
  chat_id: '5511999999999@c.us'
});

// Stop typing
socket.emit('typing:stop', {
  session_name: 'my-session',
  chat_id: '5511999999999@c.us'
});

// Listen for typing indicators
socket.on('typing:indicator', (data) => {
  console.log(`${data.user_name} is typing in ${data.chat_id}`);
});
```

### Real-Time Analytics

#### Subscribe to Analytics Updates
```javascript
socket.emit('analytics:subscribe');

// Receive initial dashboard data
socket.on('analytics:dashboard', (metrics) => {
  console.log('Dashboard metrics:', metrics);
});

// Receive real-time updates
socket.on('analytics:update', (metrics) => {
  console.log('Updated metrics:', metrics);
});

// Unsubscribe
socket.emit('analytics:unsubscribe');
```

### Session Management

```javascript
// Join session room
socket.emit('join-session', 'my-session');

// Listen for session events
socket.on('qr', (data) => {
  console.log('QR Code:', data.qr);
});

socket.on('status', (data) => {
  console.log('Status:', data.status);
});

socket.on('message', (data) => {
  console.log('New message:', data.message);
});

socket.on('connected', (data) => {
  console.log('Session connected!');
});

// Leave session room
socket.emit('leave-session', 'my-session');
```

### Enhanced Features

- **Auto-reconnection**: Automatic reconnection with exponential backoff
- **Ping/Pong**: Heartbeat mechanism with 60s timeout
- **Multiple Transports**: WebSocket and polling fallback
- **Room Management**: Tenant-scoped and session-scoped rooms
- **Event Broadcasting**: Efficient multi-room broadcasting

---

## Advanced Analytics Dashboard

Comprehensive analytics and reporting system with real-time metrics.

### Dashboard Metrics

#### Get Dashboard Overview
```http
GET /api/v1/analytics/dashboard
Authorization: Bearer {token}
X-Tenant-ID: {tenant_id}
```

Response:
```json
{
  "success": true,
  "data": {
    "overview": {
      "total_messages": 15234,
      "total_sessions": 5,
      "active_sessions": 3,
      "total_contacts": 456,
      "total_conversations": 123
    },
    "message_stats": {
      "sent": 7890,
      "received": 7344,
      "today": 234,
      "this_week": 1567,
      "this_month": 6789
    },
    "session_stats": {
      "connected": 3,
      "disconnected": 1,
      "qr_code": 1,
      "error": 0
    },
    "hourly_activity": [
      {"hour": 0, "count": 12},
      {"hour": 1, "count": 5},
      ...
    ],
    "top_contacts": [
      {
        "contact_id": "5511999999999@c.us",
        "name": "John Doe",
        "message_count": 345
      }
    ],
    "conversation_stats": {
      "open": 45,
      "closed": 78,
      "average_response_time": 0
    }
  }
}
```

### Message Trends

#### Get Trends Over Time
```http
GET /api/v1/analytics/trends?days=7
Authorization: Bearer {token}
X-Tenant-ID: {tenant_id}
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-10-14",
      "sent": 123,
      "received": 145
    },
    {
      "date": "2025-10-15",
      "sent": 156,
      "received": 167
    }
  ]
}
```

### Session Activity

#### Get Session Activity Log
```http
GET /api/v1/analytics/sessions/{sessionName}/activity?limit=50
Authorization: Bearer {token}
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "activity_type": "connected",
      "details": {"phone": "+5511999999999"},
      "timestamp": 1697836800000,
      "created_at": "2025-10-20T10:00:00.000Z"
    },
    {
      "activity_type": "message_sent",
      "details": {"to": "5511888888888@c.us", "body": "Hello"},
      "timestamp": 1697836900000,
      "created_at": "2025-10-20T10:01:40.000Z"
    }
  ]
}
```

### Custom Events

#### Track Custom Event
```http
POST /api/v1/analytics/events
Authorization: Bearer {token}
X-Tenant-ID: {tenant_id}
Content-Type: application/json

{
  "session_name": "my-session",
  "event_type": "custom_event",
  "event_data": {
    "action": "button_clicked",
    "value": "send_message"
  }
}
```

#### Get Events
```http
GET /api/v1/analytics/events?event_type=custom_event&limit=100
Authorization: Bearer {token}
```

### Analytics Cleanup

#### Clean Old Data
```http
DELETE /api/v1/analytics/cleanup?days=90
Authorization: Bearer {admin_token}
```

### Integration Example

```javascript
// Dashboard component example
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

function Dashboard() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    // Initial fetch
    fetch('/api/v1/analytics/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': tenantId
      }
    })
    .then(res => res.json())
    .then(data => setMetrics(data.data));

    // Real-time updates via WebSocket
    const socket = io({
      auth: { token }
    });

    socket.emit('analytics:subscribe');

    socket.on('analytics:update', (data) => {
      setMetrics(data);
    });

    return () => {
      socket.emit('analytics:unsubscribe');
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      {metrics && (
        <>
          <div>Total Messages: {metrics.overview.total_messages}</div>
          <div>Active Sessions: {metrics.overview.active_sessions}</div>
          {/* ... */}
        </>
      )}
    </div>
  );
}
```

---

## Backup & Disaster Recovery

Automated backup system with disaster recovery capabilities.

### Create Backup

#### Manual Backup
```http
POST /api/v1/backups
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "tenant_id": "optional-tenant-id",
  "type": "manual",
  "compress": true
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "tenant_id": null,
    "backup_type": "manual",
    "file_path": "/path/to/backups/backup-manual-2025-10-20T10-00-00.db.gz",
    "file_size": 1048576,
    "status": "completed",
    "created_at": "2025-10-20T10:00:00.000Z"
  },
  "message": "Backup created successfully"
}
```

### List Backups

```http
GET /api/v1/backups?tenant_id={tenant_id}&limit=50
Authorization: Bearer {admin_token}
```

### Backup Statistics

```http
GET /api/v1/backups/stats
Authorization: Bearer {admin_token}
```

Response:
```json
{
  "success": true,
  "data": {
    "total_backups": 45,
    "total_size": 524288000,
    "last_backup": "2025-10-20T03:00:00.000Z",
    "failed_backups": 2
  }
}
```

### Restore from Backup

```http
POST /api/v1/backups/{backup_id}/restore
Authorization: Bearer {admin_token}
```

**IMPORTANT**: After restoring, you must restart the application.

Response:
```json
{
  "success": true,
  "message": "Database restored successfully. Please restart the application."
}
```

### Export Tenant Data

```http
POST /api/v1/backups/export-tenant
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "tenant_id": "tenant-uuid"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "export_path": "/path/to/backups/tenant-export-tenant-uuid-2025-10-20.json"
  },
  "message": "Tenant data exported successfully"
}
```

### Cleanup Old Backups

```http
DELETE /api/v1/backups/cleanup?days=30
Authorization: Bearer {admin_token}
```

### Automated Backups

Backups are automatically created daily at 3 AM (configured in server startup):

```typescript
// Automated backup schedule (runs daily)
const backupInterval = BackupService.scheduleAutomatedBackups();
```

### Backup Types

1. **Full Backup**: Complete database backup
2. **Incremental Backup**: Only changes since last backup (future feature)
3. **Manual Backup**: On-demand backup triggered by admin

### Disaster Recovery Procedure

1. **Identify the Issue**
   ```bash
   # Check database integrity
   curl http://localhost:3000/api/v1/health/detailed
   ```

2. **Select Backup**
   ```bash
   # List available backups
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/v1/backups
   ```

3. **Restore Database**
   ```bash
   # Restore from backup
   curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/v1/backups/1/restore
   ```

4. **Restart Application**
   ```bash
   # Using PM2
   pm2 restart wppagent

   # Using Docker
   docker-compose restart wppagent-prod

   # Using systemd
   sudo systemctl restart wppagent
   ```

5. **Verify Recovery**
   ```bash
   # Check health
   curl http://localhost:3000/api/v1/health/detailed

   # Verify data
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/v1/sessions
   ```

### Best Practices

1. **Automate Backups**: Use the automated scheduler (enabled by default)
2. **Test Restores**: Regularly test restore procedures in staging
3. **Monitor Backup Status**: Check backup stats regularly
4. **Offsite Storage**: Copy backups to cloud storage (S3, GCS, etc.)
5. **Retention Policy**: Keep backups for 30+ days
6. **Compression**: Always enable compression to save space

### Backup Security

- Backups contain sensitive data (encrypted tokens, user info)
- Store backups in secure, encrypted locations
- Use appropriate file permissions (chmod 600)
- Consider encrypting backups before offsite storage

### Recovery Time Objective (RTO)

- Typical restore time: < 5 minutes for databases up to 1GB
- Application restart: 10-30 seconds
- Total downtime: < 10 minutes

### Recovery Point Objective (RPO)

- With daily backups: Up to 24 hours of data loss
- With hourly backups: Up to 1 hour of data loss (configure cron)

---

## Migration System

The application uses an automatic migration system to upgrade the database schema.

### Migrations Run on Startup

All migrations are automatically executed when the server starts:

```typescript
// In server.ts
import { runMigrations } from './config/migrations';

runMigrations();
```

### Current Migrations

1. **add_multi_tenancy_support**: Adds tenant tables and multi-tenancy columns
2. **add_presence_tracking**: Adds presence and session activity tracking

### Manual Migration Management

```typescript
import { runMigrations, getMigrations, rollbackMigration } from './config/migrations';

// Run all pending migrations
runMigrations();

// Get list of executed migrations
const migrations = getMigrations();
console.log(migrations);

// Rollback a migration (use with caution!)
rollbackMigration('migration_name');
```

---

## Performance Considerations

### Database

- Indexes created on all foreign keys and frequently queried columns
- WAL mode for better concurrency
- Automatic VACUUM and ANALYZE
- Connection pooling for read operations

### WebSocket

- Efficient room-based broadcasting
- Automatic reconnection with exponential backoff
- Heartbeat mechanism (ping/pong)
- Multiple transport support

### Analytics

- Hourly aggregation for performance
- Automatic cleanup of old data (90 days default)
- Indexed timestamp columns
- Prepared statement caching

### Memory

- Presence records auto-cleanup (5 minutes)
- Analytics cleanup scheduler
- Backup file compression
- Memory monitoring and leak detection

---

## Security Considerations

### Multi-Tenancy

- Complete data isolation between tenants
- Tenant-scoped queries enforced by middleware
- Resource limits per plan
- Rate limiting per tenant

### WebSocket

- JWT authentication required
- Tenant context validation
- Room access control
- Message validation

### Backups

- Admin-only access
- Secure file storage
- Encrypted token storage in backups
- Audit logging

---

## Troubleshooting

### Tenant Issues

**Problem**: User can't access tenant data
- Check `X-Tenant-ID` header or subdomain
- Verify user's `tenant_id` field
- Check tenant status (must be "active")

**Problem**: Session limit reached
- Upgrade tenant plan
- Delete unused sessions
- Check plan limits

### WebSocket Issues

**Problem**: Presence not updating
- Check presence cleanup interval (2 minutes)
- Verify tenant context
- Check WebSocket connection

**Problem**: Analytics not updating
- Verify subscription: `analytics:subscribe`
- Check tenant room membership
- Verify JWT token

### Backup Issues

**Problem**: Backup failed
- Check disk space
- Verify backup directory permissions
- Check database lock status

**Problem**: Restore failed
- Verify backup file exists
- Check file integrity
- Ensure application has write access

---

## API Summary

### Tenant Management
- `POST /api/v1/tenants` - Create tenant
- `GET /api/v1/tenants` - List tenants
- `GET /api/v1/tenants/:id` - Get tenant
- `PATCH /api/v1/tenants/:id` - Update tenant
- `DELETE /api/v1/tenants/:id` - Delete tenant
- `GET /api/v1/tenants/:id/stats` - Get stats
- `GET /api/v1/tenants/:id/settings` - Get settings
- `PATCH /api/v1/tenants/:id/settings` - Update settings

### Analytics
- `GET /api/v1/analytics/dashboard` - Dashboard metrics
- `GET /api/v1/analytics/trends` - Message trends
- `GET /api/v1/analytics/sessions/:sessionName/activity` - Activity log
- `GET /api/v1/analytics/events` - Get events
- `POST /api/v1/analytics/events` - Track event
- `DELETE /api/v1/analytics/cleanup` - Cleanup old data

### Backups
- `POST /api/v1/backups` - Create backup
- `GET /api/v1/backups` - List backups
- `GET /api/v1/backups/stats` - Backup stats
- `POST /api/v1/backups/:id/restore` - Restore backup
- `POST /api/v1/backups/export-tenant` - Export tenant
- `DELETE /api/v1/backups/cleanup` - Delete old backups

---

## License

This project is licensed under the terms specified in the LICENSE file.
