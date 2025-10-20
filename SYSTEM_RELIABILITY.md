# System Reliability Improvements

This document describes the comprehensive system reliability improvements implemented in the WhatsApp Agent application.

## Overview

The following improvements have been implemented to ensure production-ready reliability:

1. **Comprehensive Error Handling**
2. **Database Optimization & Transactions**
3. **Memory Leak Detection & Fixes**
4. **Graceful Shutdown Implementation**
5. **Health Monitoring & Metrics**
6. **Enhanced Docker Configuration**

---

## 1. Comprehensive Error Handling

### Custom Error Classes
Located in `src/utils/errors.ts`:
- `AppError` - Base error class with operational flag
- `ValidationError` - Input validation failures (400)
- `AuthenticationError` - Auth failures (401)
- `AuthorizationError` - Permission failures (403)
- `NotFoundError` - Resource not found (404)
- `ConflictError` - Resource conflicts (409)
- `RateLimitError` - Rate limit exceeded (429)

### Retry Mechanisms
Located in `src/utils/retry.utils.ts`:

#### Automatic Retry
```typescript
import { retry, retryDatabase, retryNetwork } from './utils/retry.utils';

// Generic retry with exponential backoff
await retry(async () => {
  return await someOperation();
}, {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  exponentialBackoff: true
});

// Database-specific retry (handles SQLITE_BUSY)
await retryDatabase(() => {
  return db.prepare('INSERT ...').run();
});

// Network-specific retry (handles ECONNREFUSED, ETIMEDOUT, etc.)
await retryNetwork(async () => {
  return await fetch('https://api.example.com');
});
```

#### Circuit Breaker Pattern
```typescript
import { CircuitBreaker } from './utils/retry.utils';

const breaker = new CircuitBreaker(5, 60000, 30000);

await breaker.execute(async () => {
  return await externalService.call();
});
```

#### Rate Limiting (Token Bucket)
```typescript
import { RateLimiter } from './utils/retry.utils';

const limiter = new RateLimiter(100, 10); // 100 capacity, 10 tokens/sec
await limiter.acquire(1); // Acquire 1 token
```

---

## 2. Database Optimization & Transactions

Located in `src/utils/database.utils.ts`:

### Transaction Support
```typescript
import { executeTransaction, createTransaction } from './utils/database.utils';
import db from './config/database';

// Simple transaction
executeTransaction(db, () => {
  db.prepare('INSERT INTO users ...').run(userData);
  db.prepare('INSERT INTO sessions ...').run(sessionData);
});

// Transaction class
const transaction = createTransaction(db);
await transaction.execute(() => {
  // Multiple operations here
});
```

### Batch Inserts
```typescript
import { batchInsert } from './utils/database.utils';

batchInsert(db, 'INSERT INTO messages VALUES (?, ?, ?)', [
  ['msg1', 'chat1', 'body1'],
  ['msg2', 'chat2', 'body2'],
  // ... thousands of records
]);
```

### Performance Optimizations
Applied automatically on server start:
- WAL mode enabled for better concurrency
- 64MB cache size
- mmap_size optimization
- NORMAL synchronous mode (safe with WAL)
- Automatic ANALYZE and VACUUM

```typescript
import { optimizeDatabase, getDatabaseStats } from './utils/database.utils';

// Manual optimization
optimizeDatabase(db);

// Get statistics
const stats = getDatabaseStats(db);
console.log(stats);
// {
//   pageCount: 1000,
//   pageSize: 4096,
//   totalSize: 4096000,
//   walMode: 'wal',
//   ...
// }
```

### Database Integrity Checks
```typescript
import { checkDatabaseIntegrity } from './utils/database.utils';

const isOk = checkDatabaseIntegrity(db);
if (!isOk) {
  // Handle corruption
}
```

---

## 3. Memory Leak Detection & Monitoring

Located in `src/utils/memory.utils.ts`:

### Memory Monitor
```typescript
import { MemoryMonitor } from './utils/memory.utils';

const monitor = new MemoryMonitor(
  100,  // max snapshots
  512,  // warning threshold MB
  1024  // critical threshold MB
);

// Event handlers
monitor.on('warning', (data) => {
  console.log('High memory:', data);
});

monitor.on('critical', (data) => {
  console.log('Critical memory:', data);
});

monitor.on('leak', (leak) => {
  console.log('Memory leak detected:', leak);
});

// Start monitoring
monitor.start(30000); // Check every 30 seconds

// Get statistics
const stats = monitor.getStats();
```

### Resource Cleanup
```typescript
import { resourceCleaner } from './utils/memory.utils';

// Register cleanup functions
resourceCleaner.register('websocket', () => {
  wsService.close();
});

resourceCleaner.register('timer', () => {
  clearInterval(timerId);
});

// Clean up specific resource
resourceCleaner.cleanup('websocket');

// Clean up all resources
resourceCleaner.cleanupAll();
```

### Force Garbage Collection
Run Node.js with `--expose-gc` flag to enable:
```typescript
import { MemoryMonitor } from './utils/memory.utils';

const monitor = new MemoryMonitor();
monitor.forceGC(); // Force garbage collection
```

---

## 4. Graceful Shutdown

Implemented in `src/server.ts`:

### Features
- 30-second timeout for graceful shutdown
- Prevents duplicate shutdown attempts
- Proper cleanup order:
  1. Stop accepting new connections
  2. Stop monitoring services
  3. Close WhatsApp sessions
  4. Close WebSocket connections
  5. Optimize and close database
  6. Clean up remaining resources

### Signals Handled
- `SIGTERM` - Graceful termination
- `SIGINT` - Ctrl+C
- `uncaughtException` - Unhandled exceptions
- `unhandledRejection` - Unhandled promise rejections

### Testing Graceful Shutdown
```bash
# Send SIGTERM
kill -TERM <process-id>

# Send SIGINT (Ctrl+C)
# Press Ctrl+C in terminal

# Using PM2
pm2 stop wppagent
```

---

## 5. Health Monitoring & Metrics

Located in `src/services/health.service.ts`:

### Health Endpoints

#### Basic Health Check
```bash
GET /health
```
Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-20T10:00:00.000Z",
  "uptime": 3600
}
```

#### Detailed Health Check
```bash
GET /api/v1/health/detailed
```
Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-20T10:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "pass",
      "message": "Database is healthy",
      "details": {
        "pageCount": 1000,
        "sizeMB": 4
      }
    },
    "memory": {
      "status": "pass",
      "message": "Memory usage normal",
      "details": {
        "heapUsedPercent": "45.32",
        "heapUsedMB": "234.56"
      }
    },
    "disk": {
      "status": "pass",
      "message": "System memory normal",
      "details": {
        "usedPercent": "65.42",
        "freeGB": "12.34"
      }
    },
    "sessions": {
      "status": "pass",
      "message": "2 active session(s)",
      "details": {
        "activeCount": 2,
        "sessions": ["session1", "session2"]
      }
    }
  },
  "system": {
    "memory": {
      "heapUsed": 234,
      "heapTotal": 512,
      "rss": 678,
      "heapUsedPercent": 45.7
    },
    "cpu": {
      "loadAverage": [1.2, 0.8, 0.5],
      "cpuCount": 8,
      "usagePercent": 12.5
    },
    "process": {
      "uptime": 3600,
      "pid": 12345,
      "nodeVersion": "v22.0.0"
    },
    "system": {
      "platform": "linux",
      "arch": "x64",
      "freeMemory": 12000,
      "totalMemory": 32000,
      "memoryUsagePercent": 62.5
    }
  }
}
```

#### Liveness Probe (Kubernetes/Docker)
```bash
GET /api/v1/health/live
```

#### Readiness Probe (Kubernetes/Docker)
```bash
GET /api/v1/health/ready
```

### Automatic Monitoring
The health service automatically monitors system health every 60 seconds and logs warnings/errors.

---

## 6. Enhanced Docker Configuration

### Multi-Stage Build

The Dockerfile now supports multiple build targets:

#### Development
```bash
docker-compose up wppagent-dev
```
Features:
- Hot reload
- Debug logging
- Chromium included
- Full development tools

#### Production
```bash
docker-compose --profile production up wppagent-prod
```
Features:
- Multi-stage build (smaller image)
- Non-root user (security)
- Production dependencies only
- Optimized layers
- Health checks
- Tini for proper signal handling

### Docker Compose Services

#### Main Services
- `wppagent-dev` - Development environment
- `wppagent-prod` - Production environment (use `--profile production`)
- `nginx` - Reverse proxy (optional, use `--profile production`)
- `redis` - Caching layer (optional, use `--profile production`)

#### Resource Limits
Development:
- CPU: 0.5-2 cores
- Memory: 512MB-2GB

Production:
- CPU: 1-4 cores
- Memory: 1GB-4GB

### Docker Commands

```bash
# Development
docker-compose up wppagent-dev

# Production
docker-compose --profile production up -d

# Build specific stage
docker build --target production -t wppagent:prod .

# View logs
docker-compose logs -f wppagent-dev

# Health check
docker-compose exec wppagent-dev curl http://localhost:3000/health
```

---

## 7. Process Manager (PM2)

Configuration file: `ecosystem.config.js`

### Features
- Automatic restart on crashes
- Memory-based restart (1GB limit)
- Graceful shutdown (30s timeout)
- Log rotation
- Daily cron restart (3 AM)
- Source map support
- Manual GC enabled

### PM2 Commands

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit

# View logs
pm2 logs wppagent

# Restart
pm2 restart wppagent

# Stop
pm2 stop wppagent

# Delete
pm2 delete wppagent

# Save process list
pm2 save

# Startup script (runs on system boot)
pm2 startup
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required Variables
- `JWT_SECRET` - Must be at least 32 characters
- `ENCRYPTION_KEY` - Must be exactly 64 hex characters

### Generate Secure Keys

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate encryption key
openssl rand -hex 32
```

---

## Testing

### Health Checks
```bash
# Basic health
curl http://localhost:3000/health

# Detailed health
curl http://localhost:3000/api/v1/health/detailed

# Liveness
curl http://localhost:3000/api/v1/health/live

# Readiness
curl http://localhost:3000/api/v1/health/ready
```

### Memory Monitoring
```bash
# Run with GC enabled
node --expose-gc dist/server.js

# Or with PM2
pm2 start ecosystem.config.js --node-args="--expose-gc"
```

### Load Testing
```bash
# Install artillery
npm install -g artillery

# Run load test
artillery quick --count 100 --num 10 http://localhost:3000/health
```

---

## Production Deployment Checklist

- [ ] Set strong `JWT_SECRET` (min 32 chars)
- [ ] Generate secure `ENCRYPTION_KEY` (64 hex chars)
- [ ] Set appropriate `CORS_ORIGIN`
- [ ] Use `LOG_LEVEL=warn` or `LOG_LEVEL=error`
- [ ] Enable HTTPS with valid certificates
- [ ] Set up Nginx reverse proxy
- [ ] Configure firewall rules
- [ ] Set up monitoring (PM2, Docker health checks)
- [ ] Configure log aggregation
- [ ] Set up automated backups
- [ ] Test graceful shutdown
- [ ] Test health endpoints
- [ ] Load test the application
- [ ] Set up alerting for critical errors

---

## Monitoring in Production

### Metrics to Monitor
1. **Memory Usage** - Should not continuously increase
2. **CPU Usage** - Should be under 80% on average
3. **Database Size** - Monitor growth
4. **Active Sessions** - Track WhatsApp sessions
5. **Error Rates** - Monitor application errors
6. **Response Times** - API endpoint performance
7. **WebSocket Connections** - Active connections count

### Log Locations
- PM2 Logs: `./logs/pm2-*.log`
- Application Logs: Standard output (captured by PM2/Docker)
- Docker Logs: `docker-compose logs`

---

## Troubleshooting

### High Memory Usage
1. Check memory monitoring endpoint: `/api/v1/health/detailed`
2. Review memory stats for leak patterns
3. Force garbage collection: `--expose-gc` flag
4. Restart application if memory leak detected

### Database Locked Errors
- Automatically retried with exponential backoff
- Check for long-running transactions
- Verify WAL mode is enabled

### Graceful Shutdown Timeout
- Check for hanging WhatsApp sessions
- Review cleanup logs
- Increase timeout in `server.ts` if needed

### WebSocket Connection Issues
- Verify JWT token is valid
- Check CORS configuration
- Review WebSocket logs

---

## Performance Optimizations

### Database
- ✅ WAL mode for concurrency
- ✅ Optimized cache size (64MB)
- ✅ Automatic VACUUM and ANALYZE
- ✅ Proper indexes on frequently queried columns
- ✅ Batch inserts for bulk operations
- ✅ Prepared statement caching

### Memory
- ✅ Memory monitoring and leak detection
- ✅ Resource cleanup on shutdown
- ✅ Manual GC when needed
- ✅ Memory-based restart threshold

### Network
- ✅ Keep-alive connections
- ✅ Gzip compression
- ✅ Rate limiting
- ✅ Connection timeouts

### Docker
- ✅ Multi-stage builds (smaller images)
- ✅ Layer caching optimization
- ✅ Non-root user
- ✅ Health checks
- ✅ Resource limits

---

## Security Improvements

1. **Non-root Docker user** - Runs as UID 1001
2. **Security headers** - Helmet middleware
3. **Rate limiting** - Multiple tiers (API, auth, messages)
4. **CORS** - Configurable origins
5. **JWT authentication** - Secure token-based auth
6. **Encryption** - AES-256-GCM for sensitive data
7. **Input validation** - Joi schemas
8. **SQL injection protection** - Prepared statements
9. **HTTPS enforcement** - Nginx configuration
10. **Security options** - no-new-privileges in Docker

---

## Future Improvements

- [ ] Implement Redis caching layer
- [ ] Add Prometheus metrics export
- [ ] Set up distributed tracing
- [ ] Implement database replication
- [ ] Add automated backup system
- [ ] Set up log aggregation (ELK stack)
- [ ] Implement API versioning
- [ ] Add GraphQL support
- [ ] Implement WebSocket reconnection logic
- [ ] Add rate limiting per session

---

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review application logs
3. Check health endpoints
4. Review memory and database metrics
5. Open an issue on GitHub

---

## License

This project is licensed under the terms specified in the LICENSE file.
