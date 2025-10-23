import db from '../config/database';
import logger from '../config/logger';
import { EventEmitter } from 'events';

export interface OnlineUser {
  id: number;
  user_id: string;
  tenant_id: string;
  socket_id: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  last_seen: string;
  metadata?: any;
  created_at: string;
}

export interface PresenceUpdate {
  user_id: string;
  tenant_id: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  socket_id?: string;
  metadata?: any;
}

export class PresenceService extends EventEmitter {
  private static instance: PresenceService;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.startCleanupInterval();
  }

  static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  /**
   * Set user online
   */
  setOnline(userId: string, tenantId: string, socketId: string, metadata?: any): void {
    try {
      // Check if user already has an online record
      const existing = db
        .prepare('SELECT * FROM online_users WHERE user_id = ? AND socket_id = ?')
        .get(userId, socketId) as OnlineUser | undefined;

      if (existing) {
        // Update existing record
        db.prepare(`
          UPDATE online_users
          SET status = 'online', last_seen = CURRENT_TIMESTAMP, metadata = ?
          WHERE id = ?
        `).run(metadata ? JSON.stringify(metadata) : null, existing.id);
      } else {
        // Insert new record
        db.prepare(`
          INSERT INTO online_users (user_id, tenant_id, socket_id, status, metadata)
          VALUES (?, ?, ?, 'online', ?)
        `).run(userId, tenantId, socketId, metadata ? JSON.stringify(metadata) : null);
      }

      logger.debug('User set online', { userId, socketId });

      // Emit presence update
      this.emit('presence:online', {
        user_id: userId,
        tenant_id: tenantId,
        status: 'online',
        socket_id: socketId,
      });
    } catch (error: any) {
      logger.error('Failed to set user online', { error: error.message });
    }
  }

  /**
   * Set user offline
   */
  setOffline(socketId: string): void {
    try {
      const user = db
        .prepare('SELECT * FROM online_users WHERE socket_id = ?')
        .get(socketId) as OnlineUser | undefined;

      if (user) {
        db.prepare('DELETE FROM online_users WHERE socket_id = ?').run(socketId);

        logger.debug('User set offline', { userId: user.user_id, socketId });

        // Emit presence update
        this.emit('presence:offline', {
          user_id: user.user_id,
          tenant_id: user.tenant_id,
          status: 'offline',
          socket_id: socketId,
        });
      }
    } catch (error: any) {
      logger.error('Failed to set user offline', { error: error.message });
    }
  }

  /**
   * Update user status
   */
  updateStatus(
    userId: string,
    status: 'online' | 'away' | 'busy' | 'offline'
  ): void {
    try {
      db.prepare(`
        UPDATE online_users
        SET status = ?, last_seen = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(status, userId);

      logger.debug('User status updated', { userId, status });

      // Get tenant_id for event
      const user = db
        .prepare('SELECT tenant_id FROM online_users WHERE user_id = ? LIMIT 1')
        .get(userId) as { tenant_id: string } | undefined;

      if (user) {
        this.emit('presence:status', {
          user_id: userId,
          tenant_id: user.tenant_id,
          status,
        });
      }
    } catch (error: any) {
      logger.error('Failed to update user status', { error: error.message });
    }
  }

  /**
   * Get online users for a tenant
   */
  getOnlineUsers(tenantId: string): OnlineUser[] {
    const users = db
      .prepare(`
        SELECT * FROM online_users
        WHERE tenant_id = ?
        ORDER BY last_seen DESC
      `)
      .all(tenantId) as OnlineUser[];

    return users.map((u) => ({
      ...u,
      metadata: u.metadata ? JSON.parse(u.metadata) : null,
    }));
  }

  /**
   * Get user presence
   */
  getUserPresence(userId: string): OnlineUser | null {
    const user = db
      .prepare(`
        SELECT * FROM online_users
        WHERE user_id = ?
        LIMIT 1
      `)
      .get(userId) as OnlineUser | undefined;

    if (!user) return null;

    return {
      ...user,
      metadata: user.metadata ? JSON.parse(user.metadata) : null,
    };
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM online_users WHERE user_id = ? AND status = "online"')
      .get(userId) as { count: number };

    return result.count > 0;
  }

  /**
   * Get online count for tenant
   */
  getOnlineCount(tenantId: string): number {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM online_users WHERE tenant_id = ? AND status = "online"')
      .get(tenantId) as { count: number };

    return result.count;
  }

  /**
   * Update user's last seen
   */
  updateLastSeen(userId: string): void {
    try {
      db.prepare(`
        UPDATE online_users
        SET last_seen = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(userId);
    } catch (error: any) {
      logger.error('Failed to update last seen', { error: error.message });
    }
  }

  /**
   * Clean up stale presence records (older than 5 minutes)
   */
  private cleanupStaleRecords(): void {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const deleted = db
        .prepare(`
          DELETE FROM online_users
          WHERE last_seen < ?
        `)
        .run(fiveMinutesAgo);

      if (deleted.changes > 0) {
        logger.debug('Cleaned up stale presence records', {
          count: deleted.changes,
        });
      }
    } catch (error: any) {
      logger.error('Failed to cleanup stale records', { error: error.message });
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean up every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleRecords();
    }, 2 * 60 * 1000);

    logger.info('Presence cleanup interval started');
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Presence cleanup interval stopped');
    }
  }

  /**
   * Get presence statistics
   */
  getStats(tenantId?: string): {
    total_online: number;
    total_away: number;
    total_busy: number;
    by_tenant?: Record<string, number>;
  } {
    const query = tenantId
      ? 'SELECT status, COUNT(*) as count FROM online_users WHERE tenant_id = ? GROUP BY status'
      : 'SELECT status, COUNT(*) as count FROM online_users GROUP BY status';

    const params = tenantId ? [tenantId] : [];
    const results = db.prepare(query).all(...params) as Array<{
      status: string;
      count: number;
    }>;

    const stats = {
      total_online: 0,
      total_away: 0,
      total_busy: 0,
    };

    results.forEach((r) => {
      if (r.status === 'online') stats.total_online = r.count;
      if (r.status === 'away') stats.total_away = r.count;
      if (r.status === 'busy') stats.total_busy = r.count;
    });

    return stats;
  }
}

export default PresenceService.getInstance();
