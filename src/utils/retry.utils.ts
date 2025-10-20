import logger from '../config/logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  exponentialBackoff?: boolean;
  onRetry?: (error: Error, attempt: number) => void;
  retryCondition?: (error: Error) => boolean;
}

/**
 * Execute a function with automatic retry on failure
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    exponentialBackoff = true,
    onRetry,
    retryCondition = () => true,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if we should retry
      if (attempt === maxRetries || !retryCondition(error)) {
        throw error;
      }

      // Calculate delay
      if (exponentialBackoff) {
        delay = Math.min(delay * 2, maxDelay);
      }

      // Call retry callback
      if (onRetry) {
        onRetry(error, attempt + 1);
      }

      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}`, {
        error: error.message,
        delay,
      });

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retry for database operations
 */
export async function retryDatabase<T>(
  fn: () => T,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return retry(
    async () => Promise.resolve(fn()),
    {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      retryCondition: (error: Error) => {
        // Retry on database locked errors
        return error.message.includes('database is locked') ||
          error.message.includes('SQLITE_BUSY');
      },
      ...options,
    }
  );
}

/**
 * Retry for network operations
 */
export async function retryNetwork<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return retry(fn, {
    maxRetries: 4,
    initialDelay: 2000,
    maxDelay: 16000,
    exponentialBackoff: true,
    retryCondition: (error: Error) => {
      // Retry on network errors
      const networkErrors = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENETUNREACH',
        'ENOTFOUND',
      ];
      return networkErrors.some(code => error.message.includes(code));
    },
    ...options,
  });
}

/**
 * Circuit breaker pattern for preventing cascading failures
 */
export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly resetTimeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();

      if (this.state === 'HALF_OPEN') {
        this.reset();
        logger.info('Circuit breaker reset to CLOSED');
      }

      return result;
    } catch (error: any) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      logger.error('Circuit breaker opened', {
        failureCount: this.failureCount,
        threshold: this.threshold,
      });
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  getState(): string {
    return this.state;
  }
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill();

    while (this.tokens < tokens) {
      await sleep(100);
      this.refill();
    }

    this.tokens -= tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Timeout wrapper for async operations
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute functions in parallel with concurrency limit
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = fn(item).then(result => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
}
