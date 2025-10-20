/**
 * PM2 Process Manager Configuration
 *
 * Usage:
 * - Development: pm2 start ecosystem.config.js --env development
 * - Production: pm2 start ecosystem.config.js --env production
 * - Monitoring: pm2 monit
 * - Logs: pm2 logs wppagent
 * - Restart: pm2 restart wppagent
 * - Stop: pm2 stop wppagent
 * - Delete: pm2 delete wppagent
 */

module.exports = {
  apps: [
    {
      name: 'wppagent',
      script: './dist/server.js',

      // Instance configuration
      instances: 1, // Use 1 for WhatsApp session management (stateful)
      exec_mode: 'fork', // Use fork mode (not cluster) for WhatsApp

      // Automatic restart
      autorestart: true,
      watch: false, // Set to true in development if needed
      max_memory_restart: '1G',

      // Environment variables
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'info',
      },

      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Advanced features
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,

      // Graceful shutdown
      kill_timeout: 30000, // 30 seconds for graceful shutdown
      wait_ready: true,
      listen_timeout: 10000,
      shutdown_with_message: true,

      // Health monitoring
      exp_backoff_restart_delay: 100,

      // Source map support
      source_map_support: true,

      // Node.js flags
      node_args: [
        '--max-old-space-size=2048',
        '--expose-gc', // Enable manual GC
      ],

      // Cron restart (optional - restart daily at 3 AM)
      cron_restart: '0 3 * * *',

      // Environment file
      env_file: '.env',
    },
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/wppagent.git',
      path: '/var/www/wppagent',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': '',
      'post-setup': 'npm install && npm run build',
    },
  },
};
