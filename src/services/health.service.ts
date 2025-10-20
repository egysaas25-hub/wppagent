import os from 'os';
import db from '../config/database';
import logger from '../config/logger';
import { getDatabaseStats, checkDatabaseIntegrity } from '../utils/database.utils';
import SessionManager from './whatsapp-session.manager';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
    sessions: HealthCheck;
  };
  system: SystemMetrics;
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

export interface SystemMetrics {
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
    heapUsedPercent: number;
  };
  cpu: {
    loadAverage: number[];
    cpuCount: number;
    usagePercent: number;
  };
  process: {
    uptime: number;
    pid: number;
    nodeVersion: string;
  };
  system: {
    platform: string;
    arch: string;
    freeMemory: number;
    totalMemory: number;
    memoryUsagePercent: number;
  };
}

export class HealthService {
  private static instance: HealthService;
  private lastCpuUsage = process.cpuUsage();
  private lastCpuCheck = Date.now();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const checks = {
      database: await this.checkDatabase(),
      memory: this.checkMemory(),
      disk: this.checkDisk(),
      sessions: this.checkSessions(),
    };

    const status = this.determineOverallStatus(checks);

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      system: this.getSystemMetrics(),
    };
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<HealthCheck> {
    try {
      // Check database connectivity
      const dbStats = getDatabaseStats(db);

      // Check integrity
      const isIntegrityOk = checkDatabaseIntegrity(db);

      if (!isIntegrityOk) {
        return {
          status: 'fail',
          message: 'Database integrity check failed',
          details: dbStats,
        };
      }

      // Check database size
      const dbSizeMB = dbStats.totalSize / 1024 / 1024;
      if (dbSizeMB > 1000) {
        return {
          status: 'warn',
          message: 'Database size is large',
          details: { ...dbStats, sizeMB: dbSizeMB },
        };
      }

      return {
        status: 'pass',
        message: 'Database is healthy',
        details: { ...dbStats, sizeMB: dbSizeMB },
      };
    } catch (error: any) {
      logger.error('Database health check failed', { error: error.message });
      return {
        status: 'fail',
        message: error.message,
      };
    }
  }

  /**
   * Check memory usage
   */
  private checkMemory(): HealthCheck {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsedPercent > 90) {
      return {
        status: 'fail',
        message: 'Memory usage critical',
        details: {
          heapUsedPercent: heapUsedPercent.toFixed(2),
          heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
        },
      };
    }

    if (heapUsedPercent > 80) {
      return {
        status: 'warn',
        message: 'Memory usage high',
        details: {
          heapUsedPercent: heapUsedPercent.toFixed(2),
          heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
        },
      };
    }

    return {
      status: 'pass',
      message: 'Memory usage normal',
      details: {
        heapUsedPercent: heapUsedPercent.toFixed(2),
        heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      },
    };
  }

  /**
   * Check disk space
   */
  private checkDisk(): HealthCheck {
    try {
      const freeMemory = os.freemem();
      const totalMemory = os.totalmem();
      const usedPercent = ((totalMemory - freeMemory) / totalMemory) * 100;

      if (usedPercent > 95) {
        return {
          status: 'fail',
          message: 'System memory critical',
          details: {
            usedPercent: usedPercent.toFixed(2),
            freeGB: (freeMemory / 1024 / 1024 / 1024).toFixed(2),
          },
        };
      }

      if (usedPercent > 85) {
        return {
          status: 'warn',
          message: 'System memory high',
          details: {
            usedPercent: usedPercent.toFixed(2),
            freeGB: (freeMemory / 1024 / 1024 / 1024).toFixed(2),
          },
        };
      }

      return {
        status: 'pass',
        message: 'System memory normal',
        details: {
          usedPercent: usedPercent.toFixed(2),
          freeGB: (freeMemory / 1024 / 1024 / 1024).toFixed(2),
        },
      };
    } catch (error: any) {
      return {
        status: 'warn',
        message: 'Could not check disk space',
        details: { error: error.message },
      };
    }
  }

  /**
   * Check WhatsApp sessions health
   */
  private checkSessions(): HealthCheck {
    try {
      const activeSessions = SessionManager.getActiveSessions();
      const sessionCount = activeSessions.length;

      return {
        status: 'pass',
        message: `${sessionCount} active session(s)`,
        details: {
          activeCount: sessionCount,
          sessions: activeSessions,
        },
      };
    } catch (error: any) {
      return {
        status: 'warn',
        message: 'Could not check sessions',
        details: { error: error.message },
      };
    }
  }

  /**
   * Get system metrics
   */
  private getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = this.getCpuUsage();

    return {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        arrayBuffers: Math.round((memUsage as any).arrayBuffers / 1024 / 1024),
        heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      cpu: {
        loadAverage: os.loadavg(),
        cpuCount: os.cpus().length,
        usagePercent: cpuUsage,
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        nodeVersion: process.version,
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
        memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
      },
    };
  }

  /**
   * Calculate CPU usage percentage
   */
  private getCpuUsage(): number {
    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastCpuCheck;

    const totalUsage = (currentUsage.user + currentUsage.system) / 1000; // Convert to ms
    const cpuPercent = (totalUsage / timeDiff) * 100;

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = currentTime;

    return Math.min(100, cpuPercent);
  }

  /**
   * Determine overall status from individual checks
   */
  private determineOverallStatus(checks: {
    database: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
    sessions: HealthCheck;
  }): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(checks).map(check => check.status);

    if (statuses.includes('fail')) {
      return 'unhealthy';
    }

    if (statuses.includes('warn')) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
    logger.info('Starting health monitoring', { intervalMs });

    return setInterval(async () => {
      const health = await this.getHealthStatus();

      if (health.status === 'unhealthy') {
        logger.error('System health is unhealthy', { health });
      } else if (health.status === 'degraded') {
        logger.warn('System health is degraded', { health });
      } else {
        logger.debug('System health check passed', {
          memory: health.system.memory.heapUsedPercent.toFixed(2) + '%',
          uptime: health.uptime,
        });
      }
    }, intervalMs);
  }
}

export default HealthService.getInstance();
