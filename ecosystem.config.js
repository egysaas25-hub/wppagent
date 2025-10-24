/**
 * PM2 Process Manager Configuration
 *
 * Usage:
 * - Development: pm2 start ecosystem.config.js --env development
 * - Production: pm2 start ecosystem.config.js --env production
 * - Monitoring: pm2 monit
 * - Logs: pm2 logs wppconnect
 * - Restart: pm2 restart wppconnect
 * - Stop: pm2 stop wppconnect
 * - Delete: pm2 delete wppconnect
 */

module.exports = {
  apps: [
    {
      name: 'wppconnect',
      script: './dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      node_args: '--expose-gc --max-old-space-size=1536',
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
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 30000,
      wait_ready: true,
      listen_timeout: 10000,
      shutdown_with_message: true,
      exp_backoff_restart_delay: 100,
      source_map_support: true,
      env_file: '.env',
    },
  ],
};