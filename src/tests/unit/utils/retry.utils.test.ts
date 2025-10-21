import { describe, it, expect, jest } from '@jest/globals';
import {
  retry,
  retryDatabase,
  retryNetwork,
  CircuitBreaker,
  RateLimiter,
  withTimeout,
} from '../../../utils/retry.utils';

describe('Retry Utils', () => {
  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        exponentialBackoff: false,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));

      await expect(
        retry(fn, { maxRetries: 2, initialDelay: 10 })
      ).rejects.toThrow('always fails');

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await retry(fn, {
        maxRetries: 2,
        initialDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should respect retryCondition', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('no retry'));

      await expect(
        retry(fn, {
          maxRetries: 3,
          initialDelay: 10,
          retryCondition: () => false,
        })
      ).rejects.toThrow('no retry');

      expect(fn).toHaveBeenCalledTimes(1); // no retries
    });
  });

  describe('retryDatabase', () => {
    it('should retry on database locked error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('database is locked'))
        .mockReturnValue('success');

      const result = await retryDatabase(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on other errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('syntax error'));

      await expect(retryDatabase(fn)).rejects.toThrow('syntax error');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryNetwork', () => {
    it('should retry on network error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await retryNetwork(fn, { initialDelay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('CircuitBreaker', () => {
    it('should allow requests when closed', async () => {
      const breaker = new CircuitBreaker(3, 60000, 30000);
      const fn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open after threshold failures', async () => {
      const breaker = new CircuitBreaker(2, 60000, 1000);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Fail twice
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      expect(breaker.getState()).toBe('OPEN');

      // Should reject without calling function
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should transition to half-open after reset timeout', async () => {
      const breaker = new CircuitBreaker(1, 60000, 100);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the breaker
      await expect(breaker.execute(fn)).rejects.toThrow();

      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Next attempt should transition to HALF_OPEN
      fn.mockResolvedValue('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('RateLimiter', () => {
    it('should allow requests within capacity', async () => {
      const limiter = new RateLimiter(2, 100); // 2 tokens, 100 per second

      await limiter.acquire(1);
      await limiter.acquire(1);

      expect(limiter.getAvailableTokens()).toBe(0);
    });

    it('should wait when no tokens available', async () => {
      const limiter = new RateLimiter(1, 10); // 1 token, 10 per second

      const start = Date.now();

      await limiter.acquire(1);
      await limiter.acquire(1); // Should wait ~100ms

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('withTimeout', () => {
    it('should resolve if completes in time', async () => {
      const fn = () => new Promise((resolve) => setTimeout(() => resolve('success'), 10));

      const result = await withTimeout(fn, 100);

      expect(result).toBe('success');
    });

    it('should reject on timeout', async () => {
      const fn = () => new Promise((resolve) => setTimeout(() => resolve('too slow'), 200));

      await expect(withTimeout(fn, 50)).rejects.toThrow('Operation timed out');
    });

    it('should use custom timeout error', async () => {
      const fn = () => new Promise((resolve) => setTimeout(() => resolve('too slow'), 200));
      const customError = new Error('Custom timeout');

      await expect(withTimeout(fn, 50, customError)).rejects.toThrow('Custom timeout');
    });
  });
});
