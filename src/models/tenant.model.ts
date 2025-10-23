import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  max_sessions: number;
  max_users: number;
  settings?: string; // JSON string
  status: 'active' | 'suspended' | 'cancelled';
  trial_ends_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  email: string;
  phone?: string;
  plan?: 'free' | 'basic' | 'pro' | 'enterprise';
  max_sessions?: number;
  max_users?: number;
  settings?: object;
}

export interface UpdateTenantInput {
  name?: string;
  email?: string;
  phone?: string;
  plan?: 'free' | 'basic' | 'pro' | 'enterprise';
  max_sessions?: number;
  max_users?: number;
  settings?: object;
  status?: 'active' | 'suspended' | 'cancelled';
}

export class TenantModel {
  /**
   * Create a new tenant
   */
  static create(data: CreateTenantInput): Tenant {
    const id = uuidv4();
    const now = new Date().toISOString();

    const planLimits = {
      free: { max_sessions: 1, max_users: 1 },
      basic: { max_sessions: 5, max_users: 3 },
      pro: { max_sessions: 20, max_users: 10 },
      enterprise: { max_sessions: -1, max_users: -1 }, // unlimited
    };

    const plan = data.plan || 'free';
    const limits = planLimits[plan];

    const stmt = db.prepare(`
      INSERT INTO tenants (
        id, name, slug, email, phone, plan, max_sessions, max_users,
        settings, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.slug,
      data.email,
      data.phone || null,
      plan,
      data.max_sessions || limits.max_sessions,
      data.max_users || limits.max_users,
      data.settings ? JSON.stringify(data.settings) : null,
      now,
      now
    );

    logger.info('Tenant created', { tenantId: id, slug: data.slug });

    return this.findById(id)!;
  }

  /**
   * Find tenant by ID
   */
  static findById(id: string): Tenant | null {
    const stmt = db.prepare('SELECT * FROM tenants WHERE id = ?');
    return stmt.get(id) as Tenant | null;
  }

  /**
   * Find tenant by slug
   */
  static findBySlug(slug: string): Tenant | null {
    const stmt = db.prepare('SELECT * FROM tenants WHERE slug = ?');
    return stmt.get(slug) as Tenant | null;
  }

  /**
   * Update tenant
   */
  static update(id: string, data: UpdateTenantInput): Tenant | null {
    const tenant = this.findById(id);
    if (!tenant) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email);
    }
    if (data.phone !== undefined) {
      updates.push('phone = ?');
      values.push(data.phone);
    }
    if (data.plan !== undefined) {
      updates.push('plan = ?');
      values.push(data.plan);
    }
    if (data.max_sessions !== undefined) {
      updates.push('max_sessions = ?');
      values.push(data.max_sessions);
    }
    if (data.max_users !== undefined) {
      updates.push('max_users = ?');
      values.push(data.max_users);
    }
    if (data.settings !== undefined) {
      updates.push('settings = ?');
      values.push(JSON.stringify(data.settings));
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }

    if (updates.length === 0) {
      return tenant;
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = db.prepare(`
      UPDATE tenants
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    logger.info('Tenant updated', { tenantId: id });

    return this.findById(id);
  }

  /**
   * Delete tenant
   */
  static delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM tenants WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes > 0) {
      logger.info('Tenant deleted', { tenantId: id });
      return true;
    }

    return false;
  }

  /**
   * List all tenants with pagination
   */
  static list(
    page: number = 1,
    limit: number = 20,
    status?: 'active' | 'suspended' | 'cancelled'
  ): { tenants: Tenant[]; total: number; page: number; limit: number } {
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM tenants';
    let countQuery = 'SELECT COUNT(*) as count FROM tenants';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      countQuery += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const tenants = db.prepare(query).all(...params, limit, offset) as Tenant[];
    const { count } = db.prepare(countQuery).get(...params) as { count: number };

    return {
      tenants,
      total: count,
      page,
      limit,
    };
  }

  /**
   * Get tenant statistics
   */
  static getStats(tenantId: string): {
    users_count: number;
    sessions_count: number;
    messages_count: number;
    active_sessions: number;
  } {
    const usersCount = db
      .prepare('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?')
      .get(tenantId) as { count: number };

    const sessionsCount = db
      .prepare('SELECT COUNT(*) as count FROM sessions WHERE tenant_id = ?')
      .get(tenantId) as { count: number };

    const messagesCount = db
      .prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_name IN (
          SELECT session_name FROM sessions WHERE tenant_id = ?
        )
      `)
      .get(tenantId) as { count: number };

    const activeSessions = db
      .prepare(`
        SELECT COUNT(*) as count FROM sessions
        WHERE tenant_id = ? AND status = 'connected'
      `)
      .get(tenantId) as { count: number };

    return {
      users_count: usersCount.count,
      sessions_count: sessionsCount.count,
      messages_count: messagesCount.count,
      active_sessions: activeSessions.count,
    };
  }

  /**
   * Check if tenant has reached session limit
   */
  static hasReachedSessionLimit(tenantId: string): boolean {
    const tenant = this.findById(tenantId);
    if (!tenant) return true;

    // Unlimited sessions
    if (tenant.max_sessions === -1) return false;

    const { sessions_count } = this.getStats(tenantId);
    return sessions_count >= tenant.max_sessions;
  }

  /**
   * Check if tenant has reached user limit
   */
  static hasReachedUserLimit(tenantId: string): boolean {
    const tenant = this.findById(tenantId);
    if (!tenant) return true;

    // Unlimited users
    if (tenant.max_users === -1) return false;

    const { users_count } = this.getStats(tenantId);
    return users_count >= tenant.max_users;
  }

  /**
   * Get tenant settings
   */
  static getSettings(tenantId: string): any {
    const tenant = this.findById(tenantId);
    if (!tenant || !tenant.settings) return {};

    try {
      return JSON.parse(tenant.settings);
    } catch (error) {
      logger.error('Failed to parse tenant settings', { tenantId, error });
      return {};
    }
  }

  /**
   * Update tenant settings
   */
  static updateSettings(tenantId: string, settings: object): boolean {
    const tenant = this.findById(tenantId);
    if (!tenant) return false;

    const currentSettings = this.getSettings(tenantId);
    const newSettings = { ...currentSettings, ...settings };

    const stmt = db.prepare(`
      UPDATE tenants
      SET settings = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(newSettings), new Date().toISOString(), tenantId);

    logger.info('Tenant settings updated', { tenantId });
    return true;
  }
}
