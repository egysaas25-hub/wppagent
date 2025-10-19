const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Ensure directories exist
const logsDir = path.join(__dirname, '..', 'logs');
const tokensDir = path.join(__dirname, '..', 'tokens');

[logsDir, tokensDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure custom logger
const customLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
    })
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Global error handlers
process.on('unhandledRejection', (err) => {
  customLogger.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  customLogger.error('Uncaught exception:', err);
  process.exit(1);
});

let isReconnecting = false;
let globalClient = null;

async function start(client) {
  customLogger.info('✅ WhatsApp client connected successfully!');
  globalClient = client;
  isReconnecting = false;

  // Get bot information
  try {
    const host = await client.getHost();
    customLogger.info(`🤖 Bot number: ${host.wid.user}`);
    customLogger.info(`📱 Push name: ${host.pushname || 'N/A'}`);
  } catch (err) {
    customLogger.error('Error getting host info:', err);
  }

  // Start phone watchdog to check connection every 30s
  client.startPhoneWatchdog(30000);
  customLogger.info('📱 Phone watchdog started (30s interval)');

  // Handle incoming messages
  client.onMessage(async (message) => {
    try {
      // Log received message
      customLogger.info(`📩 From: ${message.from} | Type: ${message.type} | Body: ${message.body || '[No text]'}`);

      // Ignore group messages if you only want individual chats
      // if (message.isGroupMsg) return;

      // Ignore messages from yourself
      if (message.fromMe) return;

      // Process text messages only
      if (!message.body || typeof message.body !== 'string') return;

      const msgLower = message.body.toLowerCase().trim();
      const chatId = message.from;

      // Command: Hello/Hi
      if (msgLower === 'hello' || msgLower === 'hi') {
        await client.sendText(chatId, '👋 Hello! How can I help you today?');
        customLogger.info('✅ Sent greeting response');
      }
      
      // Command: Ping
      else if (msgLower === 'ping') {
        await client.sendText(chatId, '🏓 Pong!');
        customLogger.info('✅ Sent pong response');
      }
      
      // Command: Help
      else if (msgLower === 'help' || msgLower === 'menu') {
        const helpText = `📋 *Available Commands:*\n\n` +
          `• *hello/hi* - Greeting\n` +
          `• *ping* - Test bot response\n` +
          `• *help/menu* - Show this menu\n` +
          `• *info* - Bot information\n` +
          `• *time* - Current server time\n` +
          `• *echo [text]* - Echo your message\n` +
          `• *sticker* - Reply to an image to convert it to sticker`;
        
        await client.sendText(chatId, helpText);
        customLogger.info('✅ Sent help menu');
      }
      
      // Command: Info
      else if (msgLower === 'info') {
        const host = await client.getHost();
        const infoText = `ℹ️ *Bot Information:*\n\n` +
          `• Number: ${host.wid.user}\n` +
          `• Name: ${host.pushname || 'N/A'}\n` +
          `• Status: Online ✅\n` +
          `• Session: testSession`;
        
        await client.sendText(chatId, infoText);
        customLogger.info('✅ Sent bot info');
      }
      
      // Command: Time
      else if (msgLower === 'time') {
        const now = new Date().toLocaleString('en-US', { 
          timeZone: 'Africa/Cairo',
          dateStyle: 'full',
          timeStyle: 'long'
        });
        await client.sendText(chatId, `🕐 Current time:\n${now}`);
        customLogger.info('✅ Sent time');
      }
      
      // Command: Echo
      else if (msgLower.startsWith('echo ')) {
        const echoText = message.body.substring(5);
        await client.sendText(chatId, `🔊 ${echoText}`);
        customLogger.info('✅ Echoed message');
      }
      
      // Command: Sticker (reply to image)
      else if (msgLower === 'sticker' && message.quotedMsg && message.quotedMsg.type === 'image') {
        await client.sendText(chatId, '🎨 Converting image to sticker...');
        
        // Download the quoted image
        const buffer = await client.decryptFile(message.quotedMsg);
        const tempPath = path.join(__dirname, '..', 'temp_image.jpg');
        fs.writeFileSync(tempPath, buffer);
        
        // Send as sticker
        await client.sendImageAsSticker(chatId, tempPath);
        
        // Clean up
        fs.unlinkSync(tempPath);
        customLogger.info('✅ Sent sticker');
      }
      
      // Mark message as seen
      await client.sendSeen(chatId);

    } catch (err) {
      customLogger.error('Error handling message:', err);
      
      // Try to notify user of error
      try {
        await client.sendText(message.from, '❌ Sorry, an error occurred processing your message.');
      } catch (sendErr) {
        customLogger.error('Error sending error message:', sendErr);
      }
    }
  });

  // Handle state changes
  client.onStateChange((state) => {
    customLogger.info(`🔄 State changed: ${state}`);
    
    if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
      customLogger.warn('⚠️ Session conflict detected. Close other WhatsApp Web sessions.');
    }
    
    if (state === 'DISCONNECTED' || state === 'desconnectedMobile') {
      customLogger.warn('🔌 Disconnected. Attempting to reconnect...');
      handleReconnection();
    }
  });

  // Handle stream changes
  client.onStreamChange((state) => {
    customLogger.info(`📡 Stream state: ${state}`);
  });

  // Handle incoming calls (optional - auto reject)
  client.onIncomingCall(async (call) => {
    customLogger.info(`📞 Incoming call from: ${call.peerJid}`);
    // Uncomment to auto-reject calls
    // await client.rejectCall(call.id);
    // customLogger.info('✅ Call rejected');
  });

  customLogger.info('🎯 Bot is ready and listening for messages!');
}

async function handleReconnection() {
  if (isReconnecting) {
    customLogger.warn('⏳ Already reconnecting, skipping...');
    return;
  }

  isReconnecting = true;
  
  try {
    if (globalClient) {
      await globalClient.close();
      customLogger.info('🔒 Client closed');
    }
  } catch (err) {
    customLogger.error('Error closing client:', err);
  }

  setTimeout(() => {
    customLogger.info('🔄 Attempting to reconnect...');
    isReconnecting = false;
    startWhatsApp();
  }, 10000); // 10 seconds delay
}

async function startWhatsApp() {
  if (isReconnecting) {
    customLogger.warn('⏳ Already reconnecting, skipping...');
    return;
  }

  try {
    customLogger.info('🚀 Initializing WPPConnect bot...');

    const client = await wppconnect.create({
      session: 'testSession',
      headless: true,
      devtools: false,
      useChrome: false,
      debug: false,
      logQR: false,
      disableWelcome: true,
      updatesLog: false,
      autoClose: 180000, // 3 minutes
      
      // Custom logger
      logger: customLogger,
      
      // Token storage
      tokenStore: 'file',
      folderNameToken: tokensDir,
      createPathFileToken: true,
      
      // Puppeteer options
      puppeteerOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions'
        ],
        pipe: true,
        dumpio: false,
        ignoreHTTPSErrors: true,
        timeout: 60000
      },
      
      // QR Code handler
      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        customLogger.info(`\n${'='.repeat(50)}`);
        customLogger.info(`📱 QR CODE - Attempt ${attempts}/5`);
        customLogger.info(`${'='.repeat(50)}`);
        
        // Save QR as image
        try {
          const matches = base64Qr.match(/^data:image\/png;base64,(.+)$/);
          if (matches && matches.length === 2) {
            const buffer = Buffer.from(matches[1], 'base64');
            const qrPath = path.join(__dirname, '..', 'qr.png');
            fs.writeFileSync(qrPath, buffer);
            customLogger.info(`💾 QR code saved: ${qrPath}`);
          }
        } catch (err) {
          customLogger.error('Error saving QR code:', err);
        }
        
        // Display ASCII QR
        console.log('\n' + asciiQR + '\n');
        customLogger.info(`🔗 URL Code: ${urlCode}`);
        customLogger.info('👆 Scan the QR code above with WhatsApp on your phone');
        customLogger.info(`${'='.repeat(50)}\n`);
      },
      
      // Status handler
      statusFind: (statusSession, session) => {
        const statusMessages = {
          isLogged: '✅ User is already logged in',
          notLogged: '❌ User not logged in - scan QR code',
          browserClose: '🔒 Browser closed',
          qrReadSuccess: '✅ QR code scanned successfully',
          qrReadFail: '❌ QR code scan failed',
          autocloseCalled: '⏱️ Auto-close triggered',
          desconnectedMobile: '📱 Disconnected from mobile',
          serverClose: '🔌 Server connection closed',
          deleteToken: '🗑️ Token deleted'
        };
        
        const message = statusMessages[statusSession] || `Status: ${statusSession}`;
        customLogger.info(`${message} (Session: ${session})`);
      },
      
      // Loading screen handler
      onLoadingScreen: (percent, message) => {
        customLogger.info(`⏳ Loading: ${percent}% - ${message}`);
      }
    });

    await start(client);

  } catch (error) {
    customLogger.error('❌ Error starting WPPConnect:', error);
    
    if (!isReconnecting) {
      isReconnecting = true;
      const retryDelay = 10000;
      customLogger.info(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
      
      setTimeout(() => {
        isReconnecting = false;
        startWhatsApp();
      }, retryDelay);
    }
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  customLogger.info(`\n🛑 ${signal} received. Shutting down gracefully...`);
  
  try {
    if (globalClient) {
      await globalClient.close();
      customLogger.info('✅ Client closed successfully');
    }
    process.exit(0);
  } catch (err) {
    customLogger.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the bot
startWhatsApp();