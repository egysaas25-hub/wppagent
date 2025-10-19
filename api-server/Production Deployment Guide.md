# 🚀 Production Deployment Guide

Complete guide for deploying your WPPConnect server to production.

---

## 📋 Pre-Deployment Checklist

- [ ] Server with at least 2GB RAM
- [ ] Node.js 14+ installed
- [ ] Domain name configured
- [ ] SSL certificate ready
- [ ] Firewall configured
- [ ] Backup strategy in place

---

## 🖥️ Server Setup

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should be 18.x
```

### 3. Install Dependencies

```bash
# Install Chrome (recommended for stability)
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb

# Install additional dependencies
sudo apt install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 \
  libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
  libappindicator1 libnss3 lsb-release xdg-utils wget
```

### 4. Create Application User

```bash
sudo useradd -m -s /bin/bash wppconnect
sudo su - wppconnect
```

---

## 📦 Application Deployment

### 1. Clone/Upload Your Application

```bash
cd /home/wppconnect
mkdir wppconnect-server
cd wppconnect-server

# Upload your files or clone from git
# scp -r ./api-server user@server:/home/wppconnect/wppconnect-server/
```

### 2. Install Dependencies

```bash
npm install --production
```

### 3. Create Environment File

```bash
nano .env
```

Add:
```env
NODE_ENV=production
PORT=3000
DB_PATH=./data/whatsapp.db
TOKENS_DIR=./tokens
LOGS_DIR=./logs
UPLOADS_DIR=./uploads

# Security
API_SECRET=your-super-secret-key-here
ALLOWED_ORIGINS=https://yourdomain.com

# Optional: Database
# DATABASE_URL=postgresql://user:pass@localhost/whatsapp
```

---

## 🔒 Security Hardening

### 1. Add Authentication Middleware

Update `server.js`:

```javascript
// Add this after bodyParser middleware
const API_SECRET = process.env.API_SECRET || 'change-this-secret';

// Simple API key authentication
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === '/health') return next();
  
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
});
```

### 2. Add Rate Limiting

```bash
npm install express-rate-limit
```

Add to `server.js`:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

### 3. Configure Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## 🔄 Process Management with PM2

### 1. Install PM2

```bash
sudo npm install -g pm2
```

### 2. Create PM2 Ecosystem File

```bash
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'wppconnect-server',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

### 3. Start Application

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. PM2 Commands

```bash
pm2 status              # Check status
pm2 logs                # View logs
pm2 logs --lines 100    # Last 100 lines
pm2 monit               # Monitor resources
pm2 restart all         # Restart
pm2 stop all            # Stop
pm2 delete all          # Remove from PM2
```

---

## 🌐 Nginx Reverse Proxy

### 1. Install Nginx

```bash
sudo apt install -y nginx
```

### 2. Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/wppconnect
```

```nginx
upstream wppconnect {
    server localhost:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Client max body size (for file uploads)
    client_max_body_size 50M;

    # Root location
    location / {
        proxy_pass http://wppconnect;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Access and error logs
    access_log /var/log/nginx/wppconnect-access.log;
    error_log /var/log/nginx/wppconnect-error.log;
}
```

### 3. Enable Site and Restart Nginx

```bash
sudo ln -s /etc/nginx/sites-available/wppconnect /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔐 SSL Certificate with Let's Encrypt

### 1. Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Obtain Certificate

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 3. Auto-Renewal

```bash
sudo certbot renew --dry-run
```

Certbot automatically sets up auto-renewal via cron.

---

## 💾 Database Backup Strategy

### 1. Create Backup Script

```bash
nano /home/wppconnect/backup.sh
```

```bash
#!/bin/bash

BACKUP_DIR="/home/wppconnect/backups"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/home/wppconnect/wppconnect-server"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp $APP_DIR/data/whatsapp.db $BACKUP_DIR/whatsapp_$DATE.db

# Backup tokens
tar -czf $BACKUP_DIR/tokens_$DATE.tar.gz -C $APP_DIR tokens/

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

### 2. Make Script Executable

```bash
chmod +x /home/wppconnect/backup.sh
```

### 3. Schedule Daily Backups

```bash
crontab -e
```

Add:
```
0 2 * * * /home/wppconnect/backup.sh >> /home/wppconnect/backup.log 2>&1
```

---

## 📊 Monitoring

### 1. PM2 Plus (Optional)

```bash
pm2 plus
# Follow instructions to link to PM2 Plus dashboard
```

### 2. Log Monitoring

```bash
# Install logrotate
sudo apt install -y logrotate

# Create logrotate config
sudo nano /etc/logrotate.d/wppconnect
```

```
/home/wppconnect/wppconnect-server/logs/*.log {
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

### 3. Resource Monitoring

```bash
# Install htop
sudo apt install -y htop

# Monitor in real-time
htop
```

---

## 🔄 Updates and Maintenance

### 1. Update Application

```bash
cd /home/wppconnect/wppconnect-server
git pull origin main  # or upload new files
npm install --production
pm2 restart wppconnect-server
```

### 2. Database Maintenance

```bash
# Vacuum SQLite database (optimize)
sqlite3 data/whatsapp.db "VACUUM;"

# Check integrity
sqlite3 data/whatsapp.db "PRAGMA integrity_check;"
```

### 3. Clear Old Sessions

```bash
# Remove sessions older than 90 days
find ./tokens -type d -mtime +90 -exec rm -rf {} +
```

---

## 🐳 Docker Deployment (Alternative)

### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

# Install Chrome
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p data tokens logs uploads

EXPOSE 3000

CMD ["node", "server.js"]
```

### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  wppconnect:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./tokens:/app/tokens
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped
    mem_limit: 2g
    networks:
      - wppconnect-network

networks:
  wppconnect-network:
    driver: bridge
```

### 3. Deploy

```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

---

## ✅ Post-Deployment Checklist

- [ ] Application accessible via HTTPS
- [ ] SSL certificate valid
- [ ] PM2 running and monitoring
- [ ] Backups scheduled and tested
- [ ] Logs rotating properly
- [ ] Firewall configured
- [ ] API authentication working
- [ ] Test session creation
- [ ] Test message sending
- [ ] Monitor for 24 hours

---

## 🚨 Troubleshooting

### Issue: Chrome/Chromium crashes

```bash
# Increase shared memory
sudo mount -o remount,size=2G /dev/shm

# Or in docker-compose.yml
shm_size: '2gb'
```

### Issue: Database locked

```bash
# Check for zombie processes
ps aux | grep node
kill -9 <PID>

# Restart PM2
pm2 restart all
```

### Issue: Out of memory

```bash
# Increase Node.js memory limit
pm2 delete all
pm2 start ecosystem.config.js --node-args="--max-old-space-size=2048"
```

---

## 📞 Support

For production issues:
1. Check logs: `pm2 logs`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/wppconnect-error.log`
3. Check system resources: `htop`
4. Restart services: `pm2 restart all && sudo systemctl restart nginx`

---

**Your WPPConnect server is now production-ready! 🎉**