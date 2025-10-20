import logger from '../config/logger';
import { EventEmitter } from 'events';

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

export interface MemoryLeak {
  detected: boolean;
  message: string;
  growth: number;
  snapshots: MemorySnapshot[];
}

/**
 * Memory monitor class for tracking and detecting memory leaks
 */
export class MemoryMonitor extends EventEmitter {
  private snapshots: MemorySnapshot[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly maxSnapshots: number;
  private readonly warningThresholdMB: number;
  private readonly criticalThresholdMB: number;

  constructor(
    maxSnapshots: number = 100,
    warningThresholdMB: number = 512,
    criticalThresholdMB: number = 1024
  ) {
    super();
    this.maxSnapshots = maxSnapshots;
    this.warningThresholdMB = warningThresholdMB;
    this.criticalThresholdMB = criticalThresholdMB;
  }

  /**
   * Start monitoring memory usage
   */
  start(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      logger.warn('Memory monitoring already started');
      return;
    }

    logger.info('Starting memory monitoring', { intervalMs });

    this.monitoringInterval = setInterval(() => {
      this.takeSnapshot();
      this.checkThresholds();
      this.detectLeaks();
    }, intervalMs);

    // Take initial snapshot
    this.takeSnapshot();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Memory monitoring stopped');
    }
  }

  /**
   * Take a memory snapshot
   */
  takeSnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: (memUsage as any).arrayBuffers || 0,
      rss: memUsage.rss,
    };

    this.snapshots.push(snapshot);

    // Keep only the last N snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Check memory thresholds
   */
  private checkThresholds(): void {
    const current = this.snapshots[this.snapshots.length - 1];
    if (!current) return;

    const heapUsedMB = current.heapUsed / 1024 / 1024;
    const rssMB = current.rss / 1024 / 1024;

    if (heapUsedMB > this.criticalThresholdMB || rssMB > this.criticalThresholdMB) {
      const message = `Critical memory usage: heap=${heapUsedMB.toFixed(2)}MB, rss=${rssMB.toFixed(2)}MB`;
      logger.error(message);
      this.emit('critical', { heapUsedMB, rssMB });
    } else if (heapUsedMB > this.warningThresholdMB || rssMB > this.warningThresholdMB) {
      const message = `High memory usage: heap=${heapUsedMB.toFixed(2)}MB, rss=${rssMB.toFixed(2)}MB`;
      logger.warn(message);
      this.emit('warning', { heapUsedMB, rssMB });
    }
  }

  /**
   * Detect potential memory leaks
   */
  detectLeaks(): MemoryLeak | null {
    if (this.snapshots.length < 10) {
      return null; // Need more data points
    }

    const recentSnapshots = this.snapshots.slice(-10);
    const firstSnapshot = recentSnapshots[0];
    const lastSnapshot = recentSnapshots[recentSnapshots.length - 1];

    const heapGrowth = lastSnapshot.heapUsed - firstSnapshot.heapUsed;
    const growthMB = heapGrowth / 1024 / 1024;

    // Check for consistent growth pattern
    let consistentGrowth = true;
    for (let i = 1; i < recentSnapshots.length; i++) {
      if (recentSnapshots[i].heapUsed < recentSnapshots[i - 1].heapUsed) {
        consistentGrowth = false;
        break;
      }
    }

    const leak: MemoryLeak = {
      detected: consistentGrowth && growthMB > 50,
      message: consistentGrowth && growthMB > 50
        ? `Potential memory leak detected: ${growthMB.toFixed(2)}MB growth over ${recentSnapshots.length} snapshots`
        : 'No memory leak detected',
      growth: growthMB,
      snapshots: recentSnapshots,
    };

    if (leak.detected) {
      logger.error(leak.message, {
        growth: growthMB.toFixed(2) + 'MB',
        snapshots: recentSnapshots.length,
      });
      this.emit('leak', leak);
    }

    return leak;
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    current: MemorySnapshot;
    average: number;
    min: number;
    max: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    const current = this.snapshots[this.snapshots.length - 1];
    const heapValues = this.snapshots.map(s => s.heapUsed);

    const average = heapValues.reduce((a, b) => a + b, 0) / heapValues.length;
    const min = Math.min(...heapValues);
    const max = Math.max(...heapValues);

    // Calculate trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (this.snapshots.length >= 5) {
      const recent = this.snapshots.slice(-5);
      const firstRecent = recent[0].heapUsed;
      const lastRecent = recent[recent.length - 1].heapUsed;
      const change = ((lastRecent - firstRecent) / firstRecent) * 100;

      if (change > 10) {
        trend = 'increasing';
      } else if (change < -10) {
        trend = 'decreasing';
      }
    }

    return {
      current,
      average,
      min,
      max,
      trend,
    };
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    this.snapshots = [];
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): boolean {
    if (global.gc) {
      logger.info('Forcing garbage collection');
      global.gc();
      return true;
    } else {
      logger.warn('Garbage collection not available. Run node with --expose-gc flag');
      return false;
    }
  }
}

/**
 * Create a memory snapshot for debugging
 */
export function createMemorySnapshot(): MemorySnapshot {
  const memUsage = process.memoryUsage();
  return {
    timestamp: Date.now(),
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    arrayBuffers: (memUsage as any).arrayBuffers || 0,
    rss: memUsage.rss,
  };
}

/**
 * Format memory size in human-readable format
 */
export function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get current memory usage summary
 */
export function getMemoryUsage(): {
  heapUsed: string;
  heapTotal: string;
  rss: string;
  external: string;
  heapUsedPercent: number;
} {
  const memUsage = process.memoryUsage();
  return {
    heapUsed: formatBytes(memUsage.heapUsed),
    heapTotal: formatBytes(memUsage.heapTotal),
    rss: formatBytes(memUsage.rss),
    external: formatBytes(memUsage.external),
    heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
  };
}

/**
 * Resource cleanup helper
 */
export class ResourceCleaner {
  private resources: Map<string, () => void> = new Map();

  /**
   * Register a cleanup function
   */
  register(name: string, cleanupFn: () => void): void {
    this.resources.set(name, cleanupFn);
  }

  /**
   * Unregister a cleanup function
   */
  unregister(name: string): void {
    this.resources.delete(name);
  }

  /**
   * Clean up a specific resource
   */
  cleanup(name: string): void {
    const cleanupFn = this.resources.get(name);
    if (cleanupFn) {
      try {
        cleanupFn();
        this.resources.delete(name);
        logger.debug(`Resource cleaned up: ${name}`);
      } catch (error: any) {
        logger.error(`Error cleaning up resource: ${name}`, { error: error.message });
      }
    }
  }

  /**
   * Clean up all resources
   */
  cleanupAll(): void {
    logger.info(`Cleaning up ${this.resources.size} resources`);
    for (const [name, cleanupFn] of this.resources.entries()) {
      try {
        cleanupFn();
        logger.debug(`Resource cleaned up: ${name}`);
      } catch (error: any) {
        logger.error(`Error cleaning up resource: ${name}`, { error: error.message });
      }
    }
    this.resources.clear();
  }
}

/**
 * Singleton instance of resource cleaner
 */
export const resourceCleaner = new ResourceCleaner();
