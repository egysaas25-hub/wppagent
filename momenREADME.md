# 📱 WPPConnect Multi-Session Server
## Complete Respond.io Alternative

A production-ready, self-hosted WhatsApp Business API server with multi-session support, built on WPPConnect.

---

## 🌟 Features

### ✅ What's Included
- **Multi-Session Management** - Run multiple WhatsApp accounts simultaneously
- **REST API** - Full-featured API for integrations
- **Web Dashboard** - Beautiful UI for managing sessions and sending messages
- **Database Storage** - SQLite (upgradable to PostgreSQL)
- **Message History** - Store and retrieve all conversations
- **Contact Management** - Automatic contact syncing
- **Broadcast Messages** - Send bulk messages with rate limiting
- **Team Features** - Assign conversations to agents
- **Real-time Status** - Monitor connection status
- **QR Code Authentication** - Easy session setup

### 📊 vs Respond.io Comparison

| Feature | Respond.io | This Solution |
|---------|-----------|---------------|
| Monthly Cost | $79-$999+ | **FREE** |
| Multiple Sessions | ✓ (Paid) | ✓ **Included** |
| API Access | ✓ (Paid) | ✓ **Full Access** |
| Message Broadcasting | ✓ | ✓ |
| Contact Management | ✓ | ✓ |
| Custom Integrations | Limited | **Unlimited** |
| Self-Hosted | ✗ | ✓ |
| Open Source | ✗ | ✓ |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ installed
- The WPPConnect project in `/d/test/wppconnect`

### Installation

1. **Create the project structure in your WPPConnect directory:**

```bash
cd /d/test/wppconnect
mkdir -p api-server/public
```

2. **Create the main server file:**

Save the `server.js` code to `/d/test/wppconnect/api-server/server.js`

3. **Create package.json:**

Save the `package.json` to `/d/test/wppconnect/api-server/package.json`

4. **Create the dashboard:**

Save the `index.html` to `/d/test/wppconnect/api-server/public/index.html`

5. **Install dependencies:**

```bash
cd api-server
npm install
```

6. **Start the server:**

```bash
npm start
```

The server will start on `http://localhost:3000`

7. **Open the dashboard:**

Open your browser and navigate to:
```
http://localhost:3000
```

Wait - we need to serve the HTML! Let me update the server to serve the dashboard...

---

## 📁 Project Structure

```
wppconnect/
├── api-server/
│   ├── server.js           # Main server file
│   ├── package.json        # Dependencies
│   ├── public/
│   │   └── index.html      # Web dashboard
│   ├── data/
│   │   └── whatsapp.db     # SQLite database (auto-created)
│   ├── tokens/             # Session tokens (auto-created)
│   ├── logs/               # Application logs (auto-created)
│   └── uploads/            # Media files (auto-created)
```

---

## 🔌 API Endpoints

### Sessions

#### Create Session
```bash
POST /sessions
Body: { "sessionName": "sales" }
```

#### Get All Sessions
```bash
GET /sessions
```

#### Get QR Code
```bash
GET /sessions/:sessionName/qr
```

#### Close Session
```bash
DELETE /sessions/:sessionName
```

### Messages

#### Send Message
```bash
POST /sessions/:sessionName/messages
Body: {
  "to": "5521999999999@c.us",
  "message": "Hello from API!"
}
```

#### Get Messages
```bash
GET /sessions/:sessionName/chats/:chatId/messages?limit=50
```

#### Broadcast Message
```bash
POST /sessions/:sessionName/broadcast
Body: {
  "recipients": ["5521999999999@c.us", "5521888888888@c.us"],
  "message": "Broadcast message"
}
```

### Conversations

#### Get Conversations
```bash
GET /sessions/:sessionName/conversations?status=open&limit=50
```

#### Assign to Agent
```bash
PATCH /sessions/:sessionName/conversations/:chatId/assign
Body: { "agent": "john@company.com" }
```

#### Mark as Read
```bash
POST /sessions/:sessionName/chats/:chatId/read
```

### Contacts

#### Get Contacts
```bash
GET /sessions/:sessionName/contacts?search=john
```

---

## 💡 Usage Examples

### Example 1: Create a Session

**Using cURL:**
```bash
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "support"}'
```

**Using JavaScript:**
```javascript
fetch('http://localhost:3000/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionName: 'support' })
})
.then(res => res.json())
.then(data => console.log(data));
```

### Example 2: Send a Message

```bash
curl -X POST http://localhost:3000/sessions/support/messages \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5521999999999@c.us",
    "message": "Hello! How can I help you?"
  }'
```

### Example 3: Get Conversations

```bash
curl http://localhost:3000/sessions/support/conversations?status=open
```

---

## 🎯 Use Cases

### 1. Customer Support
- Multiple agents handling different departments
- Assign conversations to specific agents
- Track conversation history
- Automated responses

### 2. Marketing Campaigns
- Broadcast messages to customer lists
- Scheduled campaigns
- Track delivery status

### 3. E-commerce
- Order notifications
- Shipping updates
- Customer service

### 4. CRM Integration
- Connect to your existing CRM
- Sync contacts automatically
- Track all interactions

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```bash
PORT=3000
DB_PATH=./data/whatsapp.db
TOKENS_DIR=./tokens
LOGS_DIR=./logs
```

### Database Migration to PostgreSQL

To use PostgreSQL instead of SQLite:

1. Install pg:
```bash
npm install pg
```

2. Replace the database initialization in `server.js` with PostgreSQL connection

---

## 🛡️ Security Best Practices

1. **Use HTTPS** in production
2. **Add authentication** - Implement JWT tokens
3. **Rate limiting** - Prevent abuse
4. **Firewall rules** - Restrict access to API
5. **Environment variables** - Don't hardcode secrets
6. **Regular backups** - Backup your database

---

## 🚦 Production Deployment

### Using PM2

```bash
npm install -g pm2

# Start the server
pm2 start server.js --name wppconnect-server

# Enable startup on boot
pm2 startup
pm2 save

# Monitor
pm2 monit
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t wppconnect-server .
docker run -p 3000:3000 -v $(pwd)/data:/app/data wppconnect-server
```

---

## 📊 Advanced Features to Add

### Webhooks
Notify external systems when messages arrive:
```javascript
client.onMessage(async (message) => {
  await fetch('https://your-webhook-url.com', {
    method: 'POST',
    body: JSON.stringify(message)
  });
});
```

### Message Templates
Store and reuse common responses:
```sql
CREATE TABLE message_templates (
  id INTEGER PRIMARY KEY,
  name TEXT,
  content TEXT,
  session_name TEXT
);
```

### Analytics Dashboard
Track:
- Messages sent/received per day
- Response times
- Agent performance
- Customer satisfaction

---

## 🐛 Troubleshooting

### "Session already exists" error
Delete the session tokens:
```bash
rm -rf tokens/[session-name]
```

### QR Code not appearing
Wait 5-10 seconds after creating a session, then click "View QR"

### Database locked error
Stop all instances of the server before restarting

### Chrome/Chromium not found
The system will automatically use Chromium, but you can install Chrome for better stability

---

## 📈 Scaling

### Horizontal Scaling
- Use Redis for session management
- Deploy multiple instances behind a load balancer
- Use PostgreSQL for shared database

### Message Queue
- Implement RabbitMQ or Bull for message queuing
- Handle high-volume broadcasts efficiently

---

## 🤝 Contributing

Contributions welcome! This is built on top of WPPConnect's excellent library.

---

## 📄 License

MIT License - Free for personal and commercial use

---

## 🆘 Support

For issues specific to:
- **WPPConnect library**: https://github.com/wppconnect-team/wppconnect
- **This implementation**: Check the logs in `./logs/` directory

---

## 🎉 Success Stories

Use this as a foundation for:
- ✅ Internal company communication platform
- ✅ Customer support ticketing system
- ✅ Marketing automation
- ✅ E-commerce notifications
- ✅ Appointment reminders
- ✅ IoT device notifications

---

**Built with ❤️ using WPPConnect**