import { describe, it, expect, beforeEach } from '@jest/globals';
import { TenantModel } from '../../../models/tenant.model';
import { createTestDatabase, cleanTestDatabase } from '../../helpers/test-database';
import Database from 'better-sqlite3';

describe('TenantModel', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
    cleanTestDatabase(db);
  });

  describe('create', () => {
    it('should create a tenant with default values', () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      expect(tenant).toBeDefined();
      expect(tenant.id).toBeValidUUID();
      expect(tenant.name).toBe('Test Company');
      expect(tenant.slug).toBe('test-company');
      expect(tenant.email).toBe('test@company.com');
      expect(tenant.plan).toBe('free');
      expect(tenant.max_sessions).toBe(1);
      expect(tenant.max_users).toBe(1);
      expect(tenant.status).toBe('active');
    });

    it('should create a tenant with custom plan', () => {
      const tenant = TenantModel.create({
        name: 'Enterprise Company',
        slug: 'enterprise-company',
        email: 'test@enterprise.com',
        plan: 'enterprise',
      });

      expect(tenant.plan).toBe('enterprise');
      expect(tenant.max_sessions).toBe(-1); // unlimited
      expect(tenant.max_users).toBe(-1); // unlimited
    });

    it('should create a tenant with custom settings', () => {
      const settings = {
        webhook_url: 'https://example.com/webhook',
        timezone: 'America/New_York',
      };

      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
        settings,
      });

      const savedSettings = TenantModel.getSettings(tenant.id);
      expect(savedSettings).toEqual(settings);
    });
  });

  describe('findById', () => {
    it('should find tenant by ID', () => {
      const created = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const found = TenantModel.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Test Company');
    });

    it('should return null for non-existent ID', () => {
      const found = TenantModel.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should find tenant by slug', () => {
      TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const found = TenantModel.findBySlug('test-company');

      expect(found).toBeDefined();
      expect(found?.slug).toBe('test-company');
    });

    it('should return null for non-existent slug', () => {
      const found = TenantModel.findBySlug('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update tenant properties', () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const updated = TenantModel.update(tenant.id, {
        name: 'Updated Company',
        plan: 'pro',
      });

      expect(updated?.name).toBe('Updated Company');
      expect(updated?.plan).toBe('pro');
      expect(updated?.slug).toBe('test-company'); // unchanged
    });

    it('should return null for non-existent tenant', () => {
      const updated = TenantModel.update('non-existent-id', {
        name: 'Updated',
      });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete tenant', () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const deleted = TenantModel.delete(tenant.id);
      expect(deleted).toBe(true);

      const found = TenantModel.findById(tenant.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent tenant', () => {
      const deleted = TenantModel.delete('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      // Create test tenants
      for (let i = 1; i <= 5; i++) {
        TenantModel.create({
          name: `Company ${i}`,
          slug: `company-${i}`,
          email: `company${i}@test.com`,
        });
      }
    });

    it('should list tenants with pagination', () => {
      const result = TenantModel.list(1, 3);

      expect(result.tenants).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
    });

    it('should filter by status', () => {
      // Create suspended tenant
      const suspended = TenantModel.create({
        name: 'Suspended Company',
        slug: 'suspended-company',
        email: 'suspended@test.com',
      });
      TenantModel.update(suspended.id, { status: 'suspended' });

      const result = TenantModel.list(1, 20, 'suspended');

      expect(result.tenants).toHaveLength(1);
      expect(result.tenants[0].status).toBe('suspended');
    });
  });

  describe('getStats', () => {
    it('should return tenant statistics', () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const stats = TenantModel.getStats(tenant.id);

      expect(stats).toHaveProperty('users_count');
      expect(stats).toHaveProperty('sessions_count');
      expect(stats).toHaveProperty('messages_count');
      expect(stats).toHaveProperty('active_sessions');
    });
  });

  describe('hasReachedSessionLimit', () => {
    it('should return false for unlimited sessions', () => {
      const tenant = TenantModel.create({
        name: 'Enterprise Company',
        slug: 'enterprise',
        email: 'test@enterprise.com',
        plan: 'enterprise',
      });

      const reached = TenantModel.hasReachedSessionLimit(tenant.id);
      expect(reached).toBe(false);
    });

    it('should return true when limit reached', () => {
      const tenant = TenantModel.create({
        name: 'Free Company',
        slug: 'free',
        email: 'test@free.com',
        plan: 'free', // max 1 session
      });

      // Create a session
      db.prepare(`
        INSERT INTO sessions (session_name, tenant_id, created_by)
        VALUES ('test-session', ?, 'test-user')
      `).run(tenant.id);

      const reached = TenantModel.hasReachedSessionLimit(tenant.id);
      expect(reached).toBe(true);
    });
  });

  describe('updateSettings', () => {
    it('should merge settings', () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
        settings: {
          webhook_url: 'https://old.com',
          timezone: 'UTC',
        },
      });

      TenantModel.updateSettings(tenant.id, {
        timezone: 'America/New_York',
        new_setting: 'value',
      });

      const settings = TenantModel.getSettings(tenant.id);

      expect(settings.webhook_url).toBe('https://old.com');
      expect(settings.timezone).toBe('America/New_York');
      expect(settings.new_setting).toBe('value');
    });
  });
});
