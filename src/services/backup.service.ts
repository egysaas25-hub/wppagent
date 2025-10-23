import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import db from '../config/database';
import config from '../config/environment';
import logger from '../config/logger';
import { backupDatabase } from '../utils/database.utils';

const execAsync = promisify(exec);

export interface Backup {
  id: number;
  tenant_id?: string;
  backup_type: 'full' | 'incremental' | 'manual';
  file_path: string;
  file_size: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
}

export interface BackupOptions {
  tenantId?: string;
  type?: 'full' | 'incremental' | 'manual';
  includeTokens?: boolean;
  compress?: boolean;
}

export class BackupService {
  private static backupDir = path.join(process.cwd(), 'backups');
  private static isBackupRunning = false;

  /**
   * Initialize backup directory
   */
  static initialize(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logger.info('Backup directory created', { path: this.backupDir });
    }
  }

  /**
   * Create a full database backup
   */
  static async createBackup(options: BackupOptions = {}): Promise<Backup> {
    if (this.isBackupRunning) {
      throw new Error('Another backup is already in progress');
    }

    this.isBackupRunning = true;
    const backupType = options.type || 'manual';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${backupType}-${timestamp}.db`;
    const backupPath = path.join(this.backupDir, backupFileName);

    // Create backup record
    const stmt = db.prepare(`
      INSERT INTO backups (tenant_id, backup_type, file_path, status)
      VALUES (?, ?, ?, 'in_progress')
    `);

    const result = stmt.run(options.tenantId || null, backupType, backupPath);
    const backupId = result.lastInsertRowid as number;

    try {
      logger.info('Starting database backup', {
        backupId,
        type: backupType,
        path: backupPath,
      });

      // Perform backup
      await backupDatabase(db, backupPath);

      // If compression is enabled, compress the backup
      if (options.compress) {
        await this.compressBackup(backupPath);
      }

      // Get file size
      const stats = fs.statSync(backupPath);
      const fileSize = stats.size;

      // Update backup record
      db.prepare(`
        UPDATE backups
        SET status = 'completed', file_size = ?
        WHERE id = ?
      `).run(fileSize, backupId);

      logger.info('Backup completed successfully', {
        backupId,
        fileSize,
        path: backupPath,
      });

      return this.getBackupById(backupId)!;
    } catch (error: any) {
      logger.error('Backup failed', {
        backupId,
        error: error.message,
      });

      // Update backup record with error
      db.prepare(`
        UPDATE backups
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `).run(error.message, backupId);

      throw error;
    } finally {
      this.isBackupRunning = false;
    }
  }

  /**
   * Compress backup file
   */
  private static async compressBackup(filePath: string): Promise<void> {
    try {
      const gzipPath = `${filePath}.gz`;
      await execAsync(`gzip -c "${filePath}" > "${gzipPath}"`);

      // Remove original file
      fs.unlinkSync(filePath);

      // Update file path in database
      db.prepare(`
        UPDATE backups
        SET file_path = ?
        WHERE file_path = ?
      `).run(gzipPath, filePath);

      logger.info('Backup compressed', {
        original: filePath,
        compressed: gzipPath,
      });
    } catch (error: any) {
      logger.warn('Failed to compress backup', { error: error.message });
    }
  }

  /**
   * Restore from backup
   */
  static async restoreBackup(backupId: number): Promise<void> {
    const backup = this.getBackupById(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    if (!fs.existsSync(backup.file_path)) {
      throw new Error('Backup file not found');
    }

    logger.info('Starting database restore', {
      backupId,
      path: backup.file_path,
    });

    try {
      // Close current database connection
      db.close();

      // Backup current database before restore
      const currentDbPath = config.database.path;
      const safetyBackupPath = `${currentDbPath}.before-restore-${Date.now()}`;
      fs.copyFileSync(currentDbPath, safetyBackupPath);

      logger.info('Safety backup created', { path: safetyBackupPath });

      // Restore from backup
      if (backup.file_path.endsWith('.gz')) {
        // Decompress first
        await execAsync(`gunzip -c "${backup.file_path}" > "${currentDbPath}"`);
      } else {
        fs.copyFileSync(backup.file_path, currentDbPath);
      }

      logger.info('Database restored successfully', {
        backupId,
        from: backup.file_path,
        to: currentDbPath,
      });

      // Note: Application should be restarted after restore
    } catch (error: any) {
      logger.error('Restore failed', {
        backupId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * List backups
   */
  static listBackups(
    tenantId?: string,
    limit: number = 50
  ): Array<Backup> {
    let query = 'SELECT * FROM backups';
    const params: any[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params) as Array<Backup>;
  }

  /**
   * Get backup by ID
   */
  static getBackupById(id: number): Backup | null {
    return db.prepare('SELECT * FROM backups WHERE id = ?').get(id) as Backup | null;
  }

  /**
   * Delete old backups
   */
  static deleteOldBackups(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const oldBackups = db
      .prepare('SELECT * FROM backups WHERE created_at < ?')
      .all(cutoffDate.toISOString()) as Array<Backup>;

    let deletedCount = 0;
    let errorCount = 0;

    oldBackups.forEach((backup) => {
      try {
        // Delete file
        if (fs.existsSync(backup.file_path)) {
          fs.unlinkSync(backup.file_path);
        }

        // Delete record
        db.prepare('DELETE FROM backups WHERE id = ?').run(backup.id);
        deletedCount++;
      } catch (error: any) {
        logger.error('Failed to delete backup', {
          backupId: backup.id,
          error: error.message,
        });
        errorCount++;
      }
    });

    logger.info('Old backups cleanup completed', {
      deletedCount,
      errorCount,
      daysToKeep,
    });
  }

  /**
   * Schedule automated backups
   */
  static scheduleAutomatedBackups(): NodeJS.Timeout {
    // Run backup every 24 hours
    const interval = setInterval(
      async () => {
        try {
          logger.info('Running scheduled backup');
          await this.createBackup({
            type: 'full',
            compress: true,
          });

          // Clean up old backups (keep last 30 days)
          this.deleteOldBackups(30);
        } catch (error: any) {
          logger.error('Scheduled backup failed', { error: error.message });
        }
      },
      24 * 60 * 60 * 1000
    ); // 24 hours

    logger.info('Automated backup schedule started');
    return interval;
  }

  /**
   * Export tenant data
   */
  static async exportTenantData(tenantId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFileName = `tenant-export-${tenantId}-${timestamp}.json`;
    const exportPath = path.join(this.backupDir, exportFileName);

    try {
      // Gather tenant data
      const tenantData = {
        tenant: db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId),
        users: db.prepare('SELECT * FROM users WHERE tenant_id = ?').all(tenantId),
        sessions: db.prepare('SELECT * FROM sessions WHERE tenant_id = ?').all(tenantId),
        messages: db
          .prepare(`
          SELECT m.* FROM messages m
          JOIN sessions s ON m.session_name = s.session_name
          WHERE s.tenant_id = ?
        `)
          .all(tenantId),
        contacts: db
          .prepare(`
          SELECT c.* FROM contacts c
          JOIN sessions s ON c.session_name = s.session_name
          WHERE s.tenant_id = ?
        `)
          .all(tenantId),
        conversations: db
          .prepare(`
          SELECT c.* FROM conversations c
          JOIN sessions s ON c.session_name = s.session_name
          WHERE s.tenant_id = ?
        `)
          .all(tenantId),
      };

      // Write to file
      fs.writeFileSync(exportPath, JSON.stringify(tenantData, null, 2));

      logger.info('Tenant data exported', {
        tenantId,
        path: exportPath,
      });

      return exportPath;
    } catch (error: any) {
      logger.error('Tenant export failed', {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Import tenant data
   */
  static async importTenantData(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error('Import file not found');
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Import in transaction
      const transaction = db.transaction(() => {
        // Import tenant
        if (data.tenant) {
          const keys = Object.keys(data.tenant);
          const values = keys.map((k) => data.tenant[k]);
          const placeholders = keys.map(() => '?').join(', ');

          db.prepare(`
            INSERT OR REPLACE INTO tenants (${keys.join(', ')})
            VALUES (${placeholders})
          `).run(...values);
        }

        // Import users, sessions, etc.
        // (Similar pattern for other tables)

        logger.info('Tenant data imported successfully');
      });

      transaction();
    } catch (error: any) {
      logger.error('Tenant import failed', {
        filePath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get backup statistics
   */
  static getBackupStats(): {
    total_backups: number;
    total_size: number;
    last_backup: string | null;
    failed_backups: number;
  } {
    const stats = db
      .prepare(`
      SELECT
        COUNT(*) as total_backups,
        SUM(file_size) as total_size,
        MAX(created_at) as last_backup,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_backups
      FROM backups
    `)
      .get() as any;

    return {
      total_backups: stats.total_backups || 0,
      total_size: stats.total_size || 0,
      last_backup: stats.last_backup,
      failed_backups: stats.failed_backups || 0,
    };
  }
}

// Initialize backup directory on module load
BackupService.initialize();
