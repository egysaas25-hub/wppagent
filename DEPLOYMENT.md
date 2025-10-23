# Deployment Guide

This guide provides comprehensive instructions for deploying WPPConnect to production environments, including Docker, Kubernetes, and traditional server deployments.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [PM2 Deployment](#pm2-deployment)
- [Reverse Proxy Configuration](#reverse-proxy-configuration)
- [Database Setup](#database-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Backup Strategy](#backup-strategy)
- [Security Hardening](#security-hardening)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

**Minimum Requirements:**
- CPU: 2 cores
- RAM: 2GB
- Disk: 20GB SSD
- OS: Ubuntu 20.04+, Debian 11+, or CentOS 8+

**Recommended for Production:**
- CPU: 4+ cores
- RAM: 4GB+
- Disk: 50GB+ SSD
- OS: Ubuntu 22.04 LTS

### Software Requirements

- Node.js 18.x or higher
- npm 8.x or higher
- SQLite 3.x (development) or PostgreSQL 12+ (production)
- Docker 20.10+ (if using containers)
- nginx or Traefik (reverse proxy)

---

## Environment Configuration

### Environment Variables

Create a production `.env` file:

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DB_PATH=/var/lib/wppconnect/whatsapp.db
# For PostgreSQL (recommended for production):
# DATABASE_URL=postgresql://user:password@localhost:5432/wppconnect

# Security (CHANGE THESE!)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
ENCRYPTION_KEY=your-64-character-hex-encryption-key-for-sensitive-data
SESSION_SECRET=your-session-secret-key-minimum-32-characters

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Health Monitoring
HEALTH_CHECK_INTERVAL=30000
MEMORY_THRESHOLD_PERCENT=80
CPU_THRESHOLD_PERCENT=80

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_PATH=/var/backups/wppconnect

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=/var/log/wppconnect

# CORS (adjust for your domain)
CORS_ORIGIN=https://your-domain.com

# Webhooks
WEBHOOK_TIMEOUT=5000
WEBHOOK_RETRY_ATTEMPTS=3
```

### Generate Secrets

```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32

# Generate encryption key (64 hex characters)
openssl rand -hex 32

# Generate session secret
openssl rand -base64 32
```

---

## Docker Deployment

### Single Container Deployment

**1. Build Docker Image:**

```bash
# Clone repository
git clone https://github.com/wppconnect-team/wppconnect.git
cd wppconnect

# Build image
docker build -t wppconnect:latest .
```

**2. Run Container:**

```bash
docker run -d \
  --name wppconnect \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /var/lib/wppconnect:/app/data \
  -v /var/log/wppconnect:/app/logs \
  --env-file .env.production \
  wppconnect:latest
```

### Docker Compose Deployment

**1. Create `docker-compose.yml`:**

```yaml
version: '3.8'

services:
  wppconnect:
    image: wppconnect:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: wppconnect
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DB_PATH: /app/data/whatsapp.db
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    volumes:
      - wppconnect-data:/app/data
      - wppconnect-logs:/app/logs
      - wppconnect-sessions:/app/session
    networks:
      - wppconnect-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    container_name: wppconnect-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - wppconnect-logs:/var/log/nginx
    depends_on:
      - wppconnect
    networks:
      - wppconnect-network

volumes:
  wppconnect-data:
    driver: local
  wppconnect-logs:
    driver: local
  wppconnect-sessions:
    driver: local

networks:
  wppconnect-network:
    driver: bridge
```

**2. Deploy:**

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f wppconnect

# Stop services
docker-compose down

# Restart services
docker-compose restart
```

### Multi-Container Production Setup

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    container_name: wppconnect-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: wppconnect
      POSTGRES_USER: wppconnect
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - wppconnect-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wppconnect"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: wppconnect-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - wppconnect-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  wppconnect:
    image: wppconnect:latest
    container_name: wppconnect-app
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://wppconnect:${DB_PASSWORD}@postgres:5432/wppconnect
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - wppconnect-sessions:/app/session
      - wppconnect-logs:/app/logs
    networks:
      - wppconnect-network
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  nginx:
    image: nginx:alpine
    container_name: wppconnect-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - wppconnect
    networks:
      - wppconnect-network

volumes:
  postgres-data:
  redis-data:
  wppconnect-sessions:
  wppconnect-logs:

networks:
  wppconnect-network:
    driver: bridge
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (v1.20+)
- kubectl configured
- Helm 3 (optional)

### Deployment Manifests

**1. Namespace:**

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: wppconnect
```

**2. ConfigMap:**

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: wppconnect-config
  namespace: wppconnect
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  RATE_LIMIT_WINDOW_MS: "900000"
  RATE_LIMIT_MAX_REQUESTS: "100"
```

**3. Secrets:**

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: wppconnect-secrets
  namespace: wppconnect
type: Opaque
stringData:
  JWT_SECRET: "your-jwt-secret-here"
  ENCRYPTION_KEY: "your-encryption-key-here"
  SESSION_SECRET: "your-session-secret-here"
  DATABASE_URL: "postgresql://user:pass@postgres:5432/wppconnect"
```

**4. Deployment:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wppconnect
  namespace: wppconnect
  labels:
    app: wppconnect
spec:
  replicas: 3
  selector:
    matchLabels:
      app: wppconnect
  template:
    metadata:
      labels:
        app: wppconnect
    spec:
      containers:
      - name: wppconnect
        image: wppconnect:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
          protocol: TCP
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: wppconnect-config
              key: NODE_ENV
        - name: PORT
          valueFrom:
            configMapKeyRef:
              name: wppconnect-config
              key: PORT
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: wppconnect-secrets
              key: JWT_SECRET
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: wppconnect-secrets
              key: DATABASE_URL
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/v1/health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /api/v1/health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        volumeMounts:
        - name: data
          mountPath: /app/data
        - name: sessions
          mountPath: /app/session
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: wppconnect-data-pvc
      - name: sessions
        persistentVolumeClaim:
          claimName: wppconnect-sessions-pvc
```

**5. Service:**

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: wppconnect
  namespace: wppconnect
spec:
  type: ClusterIP
  selector:
    app: wppconnect
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800
```

**6. Ingress:**

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: wppconnect
  namespace: wppconnect
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - wppconnect.yourdomain.com
    secretName: wppconnect-tls
  rules:
  - host: wppconnect.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: wppconnect
            port:
              number: 80
```

**7. HorizontalPodAutoscaler:**

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: wppconnect
  namespace: wppconnect
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: wppconnect
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**8. PersistentVolumeClaim:**

```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: wppconnect-data-pvc
  namespace: wppconnect
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: wppconnect-sessions-pvc
  namespace: wppconnect
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 20Gi
  storageClassName: standard
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Create secrets (encode values first)
kubectl create secret generic wppconnect-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 32) \
  --from-literal=ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -n wppconnect

# Apply configurations
kubectl apply -f configmap.yaml
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f hpa.yaml

# Check deployment status
kubectl get all -n wppconnect

# View logs
kubectl logs -f deployment/wppconnect -n wppconnect

# Scale deployment
kubectl scale deployment wppconnect --replicas=5 -n wppconnect
```

---

## PM2 Deployment

### Installation

```bash
# Install PM2 globally
npm install -g pm2

# Install PM2 log rotate
pm2 install pm2-logrotate
```

### PM2 Configuration

The project includes `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'wppconnect',
    script: './dist/server.js',
    instances: 4,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '1G',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
  }],
};
```

### PM2 Deployment Steps

```bash
# Build the project
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Monitor processes
pm2 monit

# View logs
pm2 logs wppconnect

# Restart application
pm2 restart wppconnect

# Stop application
pm2 stop wppconnect

# Delete from PM2
pm2 delete wppconnect
```

### PM2 Commands

```bash
# List processes
pm2 list

# Show process details
pm2 show wppconnect

# Reload (zero-downtime)
pm2 reload wppconnect

# Scale instances
pm2 scale wppconnect 8

# Monitor CPU/Memory
pm2 monit

# Generate startup script
pm2 startup systemd
```

---

## Reverse Proxy Configuration

### nginx Configuration

**1. Basic Configuration:**

```nginx
# /etc/nginx/sites-available/wppconnect
upstream wppconnect_backend {
    least_conn;
    server 127.0.0.1:3000;
    # Add more servers for load balancing
    # server 127.0.0.1:3001;
    # server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name wppconnect.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name wppconnect.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/wppconnect.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wppconnect.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/wppconnect-access.log;
    error_log /var/log/nginx/wppconnect-error.log;

    # Client body size (for file uploads)
    client_max_body_size 50M;

    # Proxy settings
    location / {
        proxy_pass http://wppconnect_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://wppconnect_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Health check endpoint (no auth required)
    location /api/v1/health {
        proxy_pass http://wppconnect_backend;
        access_log off;
    }
}
```

**2. Enable Configuration:**

```bash
# Test configuration
sudo nginx -t

# Enable site
sudo ln -s /etc/nginx/sites-available/wppconnect /etc/nginx/sites-enabled/

# Reload nginx
sudo systemctl reload nginx
```

### Traefik Configuration

```yaml
# docker-compose.yml with Traefik
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
    labels:
      - "traefik.enable=true"

  wppconnect:
    image: wppconnect:latest
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.wppconnect.rule=Host(`wppconnect.yourdomain.com`)"
      - "traefik.http.routers.wppconnect.entrypoints=websecure"
      - "traefik.http.routers.wppconnect.tls.certresolver=letsencrypt"
      - "traefik.http.services.wppconnect.loadbalancer.server.port=3000"
```

---

## Database Setup

### PostgreSQL Production Setup

**1. Install PostgreSQL:**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**2. Create Database:**

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE wppconnect;
CREATE USER wppconnect WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE wppconnect TO wppconnect;
ALTER DATABASE wppconnect OWNER TO wppconnect;
\q
```

**3. Configure Connection:**

```bash
# Update .env
DATABASE_URL=postgresql://wppconnect:your-secure-password@localhost:5432/wppconnect
```

**4. Run Migrations:**

```bash
npm run migrate
```

### Database Backups

**Automated Backup Script:**

```bash
#!/bin/bash
# /usr/local/bin/backup-wppconnect.sh

BACKUP_DIR="/var/backups/wppconnect"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/wppconnect_$DATE.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
pg_dump wppconnect | gzip > $BACKUP_FILE

# Keep only last 30 days
find $BACKUP_DIR -name "wppconnect_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

**Crontab Entry:**

```bash
# Run daily at 2 AM
0 2 * * * /usr/local/bin/backup-wppconnect.sh
```

---

## SSL/TLS Configuration

### Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d wppconnect.yourdomain.com

# Auto-renewal (add to crontab)
0 0 * * * certbot renew --quiet
```

### Manual SSL Certificate

```nginx
server {
    listen 443 ssl http2;
    server_name wppconnect.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # Strong SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
}
```

---

## Monitoring & Logging

### Application Logs

**Log Rotation:**

```bash
# /etc/logrotate.d/wppconnect
/var/log/wppconnect/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 wppconnect wppconnect
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Health Monitoring

**Systemd Service for Health Check:**

```ini
# /etc/systemd/system/wppconnect-healthcheck.service
[Unit]
Description=WPPConnect Health Check
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/check-wppconnect-health.sh

[Install]
WantedBy=multi-user.target
```

**Health Check Script:**

```bash
#!/bin/bash
# /usr/local/bin/check-wppconnect-health.sh

HEALTH_URL="http://localhost:3000/api/v1/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -ne 200 ]; then
    echo "Health check failed with status: $RESPONSE"
    # Send alert (email, Slack, etc.)
    systemctl restart wppconnect
    exit 1
fi

echo "Health check passed"
exit 0
```

---

## Backup Strategy

### Automated Backups

The system includes built-in backup functionality:

```env
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
BACKUP_RETENTION_DAYS=30
BACKUP_PATH=/var/backups/wppconnect
```

### Manual Backup

```bash
# Via API
curl -X POST http://localhost:3000/api/v1/backups \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "manual"}'

# Via CLI
pm2 stop wppconnect
cp /var/lib/wppconnect/whatsapp.db /var/backups/wppconnect/manual_$(date +%Y%m%d).db
pm2 start wppconnect
```

### Disaster Recovery

```bash
# 1. Stop application
pm2 stop wppconnect

# 2. Restore database
cp /var/backups/wppconnect/backup_YYYYMMDD.db /var/lib/wppconnect/whatsapp.db

# 3. Restore sessions
tar -xzf /var/backups/wppconnect/sessions_YYYYMMDD.tar.gz -C /app/session

# 4. Start application
pm2 start wppconnect
```

---

## Security Hardening

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Limit SSH access
sudo ufw limit 22/tcp
```

### Application Security

1. **Use strong secrets** (32+ characters)
2. **Enable rate limiting** in production
3. **Configure CORS** properly
4. **Use HTTPS only**
5. **Keep dependencies updated**
6. **Run as non-root user**
7. **Use environment variables** for secrets

### OS Security

```bash
# Disable root login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no

# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Set up fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

---

## Performance Tuning

### Node.js Optimization

```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=2048" pm2 start ecosystem.config.js

# Enable cluster mode
pm2 start ecosystem.config.js -i max
```

### nginx Optimization

```nginx
# Worker processes
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Enable gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript;

    # Caching
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;
}
```

### Database Optimization

```sql
-- PostgreSQL
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Increase shared buffers (25% of RAM)
ALTER SYSTEM SET shared_buffers = '1GB';

-- Increase work memory
ALTER SYSTEM SET work_mem = '50MB';

-- Reload config
SELECT pg_reload_conf();
```

---

## Troubleshooting

### Common Issues

**1. Application Won't Start:**

```bash
# Check logs
pm2 logs wppconnect --lines 100

# Check port availability
sudo lsof -i :3000

# Check environment variables
pm2 env 0
```

**2. Database Connection Failed:**

```bash
# Test database connection
psql -U wppconnect -d wppconnect -h localhost

# Check database logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

**3. High Memory Usage:**

```bash
# Check memory
free -h
pm2 monit

# Restart application
pm2 restart wppconnect
```

**4. SSL Certificate Issues:**

```bash
# Test SSL
openssl s_client -connect wppconnect.yourdomain.com:443

# Check certificate
sudo certbot certificates

# Renew certificate
sudo certbot renew --force-renewal
```

**5. WebSocket Connection Failed:**

```bash
# Check nginx configuration
sudo nginx -t

# Verify WebSocket upgrade headers
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:3000/socket.io/
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Secrets generated and secured
- [ ] Database setup and migrated
- [ ] SSL/TLS certificate installed
- [ ] Reverse proxy configured
- [ ] Firewall rules configured
- [ ] Backup strategy implemented
- [ ] Monitoring setup
- [ ] Log rotation configured
- [ ] Health checks enabled
- [ ] Rate limiting configured
- [ ] CORS configured
- [ ] PM2/Docker process manager setup
- [ ] Auto-restart on crash enabled
- [ ] Security headers configured
- [ ] Database backups scheduled
- [ ] Application logs monitored
- [ ] Performance tuning applied
- [ ] Documentation reviewed

---

**Document Version**: 1.0
**Last Updated**: 2024
**Author**: WPPConnect Team
