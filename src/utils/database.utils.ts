import Database from 'better-sqlite3';
import logger from '../config/logger';

export class DatabaseTransaction {
  private db: Database.Database;
  private transaction: Database.Transaction | null = null;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Execute a function within a transaction
   * Automatically commits on success, rolls back on error
   */
  async execute<T>(fn: () => T): Promise<T> {
    try {
      if (!this.transaction) {
        this.transaction = this.db.transaction(fn);
      }
      const result = this.transaction();
      logger.debug('Database transaction committed successfully');
      return result;
    } catch (error: any) {
      logger.error('Database transaction failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    } finally {
      this.transaction = null;
    }
  }
}

/**
 * Create a transaction wrapper for database operations
 */
export function createTransaction(db: Database.Database): DatabaseTransaction {
  return new DatabaseTransaction(db);
}

/**
 * Execute multiple statements in a transaction
 */
export function executeTransaction<T>(
  db: Database.Database,
  fn: () => T
): T {
  const transaction = db.transaction(fn);
  return transaction();
}

/**
 * Batch insert with transaction for better performance
 */
export function batchInsert(
  db: Database.Database,
  query: string,
  records: any[]
): void {
  const insert = db.prepare(query);
  const insertMany = db.transaction((records: any[]) => {
    for (const record of records) {
      insert.run(record);
    }
  });

  insertMany(records);
}

/**
 * Optimize database performance
 */
export function optimizeDatabase(db: Database.Database): void {
  logger.info('Optimizing database...');

  // Analyze tables to update query planner statistics
  db.exec('ANALYZE');

  // Vacuum to reclaim space (only if needed)
  const { freelist_count } = db.pragma('freelist_count', { simple: true }) as any;
  if (freelist_count > 1000) {
    logger.info('Running VACUUM to reclaim space...');
    db.exec('VACUUM');
  }

  // Optimize WAL checkpoint
  db.pragma('wal_checkpoint(TRUNCATE)');

  logger.info('Database optimization complete');
}

/**
 * Get database statistics
 */
export function getDatabaseStats(db: Database.Database): {
  pageCount: number;
  pageSize: number;
  freelistCount: number;
  walMode: string;
  cacheSize: number;
  totalSize: number;
} {
  const pageCount = db.pragma('page_count', { simple: true }) as number;
  const pageSize = db.pragma('page_size', { simple: true }) as number;
  const freelistCount = db.pragma('freelist_count', { simple: true }) as number;
  const journalMode = db.pragma('journal_mode', { simple: true }) as string;
  const cacheSize = db.pragma('cache_size', { simple: true }) as number;

  return {
    pageCount,
    pageSize,
    freelistCount,
    walMode: journalMode,
    cacheSize,
    totalSize: pageCount * pageSize,
  };
}

/**
 * Backup database to a file
 */
export async function backupDatabase(
  db: Database.Database,
  backupPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      db.backup(backupPath)
        .then(() => {
          logger.info(`Database backed up to ${backupPath}`);
          resolve();
        })
        .catch(reject);
    } catch (error) {
      logger.error('Database backup failed', { error });
      reject(error);
    }
  });
}

/**
 * Check database integrity
 */
export function checkDatabaseIntegrity(db: Database.Database): boolean {
  try {
    const result = db.pragma('integrity_check', { simple: true });
    const isOk = result === 'ok';

    if (isOk) {
      logger.info('Database integrity check passed');
    } else {
      logger.error('Database integrity check failed', { result });
    }

    return isOk;
  } catch (error: any) {
    logger.error('Database integrity check error', { error: error.message });
    return false;
  }
}

/**
 * Apply database performance optimizations
 */
export function applyPerformanceOptimizations(db: Database.Database): void {
  // Increase cache size for better performance
  db.pragma('cache_size = -64000'); // 64MB cache

  // Set synchronous mode for better performance (still safe with WAL mode)
  db.pragma('synchronous = NORMAL');

  // Increase mmap size for better performance
  db.pragma('mmap_size = 30000000000'); // 30GB

  // Set temp store to memory
  db.pragma('temp_store = MEMORY');

  // Optimize page size if database is new
  const pageCount = db.pragma('page_count', { simple: true }) as number;
  if (pageCount === 0) {
    db.pragma('page_size = 4096');
  }

  logger.info('Database performance optimizations applied');
}

/**
 * Create a prepared statement cache
 */
export class PreparedStatementCache {
  private cache: Map<string, Database.Statement> = new Map();
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get(query: string): Database.Statement {
    if (!this.cache.has(query)) {
      this.cache.set(query, this.db.prepare(query));
    }
    return this.cache.get(query)!;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Database connection pool for better-sqlite3
 * Note: better-sqlite3 is synchronous and single-connection,
 * but we can create multiple database instances for parallel operations
 */
export class DatabasePool {
  private connections: Database.Database[] = [];
  private available: Database.Database[] = [];
  private inUse: Set<Database.Database> = new Set();
  private readonly maxConnections: number;
  private readonly dbPath: string;

  constructor(dbPath: string, maxConnections: number = 5) {
    this.dbPath = dbPath;
    this.maxConnections = maxConnections;
    this.initialize();
  }

  private initialize(): void {
    // Create initial connections
    for (let i = 0; i < this.maxConnections; i++) {
      const db = new Database(this.dbPath, { readonly: true });
      db.pragma('journal_mode = WAL');
      this.connections.push(db);
      this.available.push(db);
    }
    logger.info(`Database pool initialized with ${this.maxConnections} connections`);
  }

  acquire(): Database.Database {
    const db = this.available.pop();
    if (!db) {
      throw new Error('No available database connections');
    }
    this.inUse.add(db);
    return db;
  }

  release(db: Database.Database): void {
    this.inUse.delete(db);
    this.available.push(db);
  }

  async execute<T>(fn: (db: Database.Database) => T): Promise<T> {
    const db = this.acquire();
    try {
      return fn(db);
    } finally {
      this.release(db);
    }
  }

  close(): void {
    for (const db of this.connections) {
      db.close();
    }
    this.connections = [];
    this.available = [];
    this.inUse.clear();
    logger.info('Database pool closed');
  }
}
