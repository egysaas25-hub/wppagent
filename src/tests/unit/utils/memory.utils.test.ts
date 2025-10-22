import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MemoryMonitor, ResourceCleaner, formatBytes, getMemoryUsage } from '../../../utils/memory.utils';

describe('Memory Utils', () => {
  describe('MemoryMonitor', () => {
    let monitor: MemoryMonitor;

    beforeEach(() => {
      monitor = new MemoryMonitor(10, 512, 1024);
    });

    afterEach(() => {
      monitor.stop();
    });

    it('should create snapshots', () => {
      const snapshot = monitor.takeSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('heapUsed');
      expect(snapshot).toHaveProperty('heapTotal');
      expect(snapshot).toHaveProperty('rss');
    });

    it('should limit snapshot count', () => {
      for (let i = 0; i < 15; i++) {
        monitor.takeSnapshot();
      }

      const stats = monitor.getStats();
      expect(stats).toBeDefined();
    });

    it('should emit warning on high memory', (done) => {
      const highMemMonitor = new MemoryMonitor(10, 0, 10); // Very low threshold

      highMemMonitor.on('warning', (data) => {
        expect(data).toBeDefined();
        highMemMonitor.stop();
        done();
      });

      highMemMonitor.start(10);
      highMemMonitor.takeSnapshot();
    });

    it('should detect memory trends', () => {
      // Take multiple snapshots
      for (let i = 0; i < 5; i++) {
        monitor.takeSnapshot();
      }

      const stats = monitor.getStats();

      expect(stats).toHaveProperty('current');
      expect(stats).toHaveProperty('average');
      expect(stats).toHaveProperty('min');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('trend');
      expect(['increasing', 'decreasing', 'stable']).toContain(stats?.trend);
    });

    it('should clear snapshots', () => {
      monitor.takeSnapshot();
      monitor.takeSnapshot();

      monitor.clearSnapshots();

      const stats = monitor.getStats();
      expect(stats).toBeNull();
    });
  });

  describe('ResourceCleaner', () => {
    let cleaner: ResourceCleaner;

    beforeEach(() => {
      cleaner = new ResourceCleaner();
    });

    it('should register cleanup functions', () => {
      const cleanupFn = jest.fn();

      cleaner.register('test-resource', cleanupFn);
      cleaner.cleanup('test-resource');

      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it('should clean up all resources', () => {
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();

      cleaner.register('resource1', cleanup1);
      cleaner.register('resource2', cleanup2);

      cleaner.cleanupAll();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup errors gracefully', () => {
      const errorCleanup = jest.fn().mockImplementation(() => {
        throw new Error('Cleanup failed');
      });

      cleaner.register('failing-resource', errorCleanup);

      // Should not throw
      expect(() => cleaner.cleanup('failing-resource')).not.toThrow();
    });

    it('should unregister resources', () => {
      const cleanupFn = jest.fn();

      cleaner.register('test-resource', cleanupFn);
      cleaner.unregister('test-resource');
      cleaner.cleanup('test-resource');

      expect(cleanupFn).not.toHaveBeenCalled();
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should handle decimal values', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    });
  });

  describe('getMemoryUsage', () => {
    it('should return memory usage', () => {
      const usage = getMemoryUsage();

      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('heapTotal');
      expect(usage).toHaveProperty('rss');
      expect(usage).toHaveProperty('external');
      expect(usage).toHaveProperty('heapUsedPercent');

      expect(typeof usage.heapUsedPercent).toBe('number');
      expect(usage.heapUsedPercent).toBeGreaterThan(0);
      expect(usage.heapUsedPercent).toBeLessThanOrEqual(100);
    });
  });
});
