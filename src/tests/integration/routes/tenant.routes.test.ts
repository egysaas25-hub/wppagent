import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../../app';
import { TenantModel } from '../../../models/tenant.model';
import { generateTestToken } from '../../helpers/test-server';
import { createTestDatabase, cleanTestDatabase, seedTestDatabase } from '../../helpers/test-database';

describe('Tenant Routes', () => {
  let adminToken: string;
  let agentToken: string;

  beforeAll(() => {
    createTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase(db);
    seedTestDatabase(db);

    adminToken = generateTestToken({ role: 'admin' });
    agentToken = generateTestToken({ role: 'agent' });
  });

  describe('POST /api/v1/tenants', () => {
    it('should create a tenant (admin only)', async () => {
      const response = await request(app)
        .post('/api/v1/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Company',
          slug: 'new-company',
          email: 'new@company.com',
          plan: 'pro',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('New Company');
      expect(response.body.data.slug).toBe('new-company');
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/tenants')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          name: 'New Company',
          slug: 'new-company',
          email: 'new@company.com',
        });

      expect(response.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Company',
          // missing slug and email
        });

      expect(response.status).toBe(400);
    });

    it('should reject duplicate slug', async () => {
      await request(app)
        .post('/api/v1/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Company 1',
          slug: 'test-slug',
          email: 'test1@company.com',
        });

      const response = await request(app)
        .post('/api/v1/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Company 2',
          slug: 'test-slug',
          email: 'test2@company.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('already exists');
    });
  });

  describe('GET /api/v1/tenants', () => {
    beforeEach(() => {
      // Create multiple tenants
      for (let i = 1; i <= 5; i++) {
        TenantModel.create({
          name: `Company ${i}`,
          slug: `company-${i}`,
          email: `company${i}@test.com`,
        });
      }
    });

    it('should list tenants with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/tenants?page=1&limit=3')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('page', 1);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/tenants?status=active')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      response.body.data.forEach((tenant: any) => {
        expect(tenant.status).toBe('active');
      });
    });
  });

  describe('GET /api/v1/tenants/:id', () => {
    it('should get tenant by ID', async () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const response = await request(app)
        .get(`/api/v1/tenants/${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(tenant.id);
      expect(response.body.data.name).toBe('Test Company');
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await request(app)
        .get('/api/v1/tenants/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/tenants/:id', () => {
    it('should update tenant', async () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const response = await request(app)
        .patch(`/api/v1/tenants/${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Company',
          plan: 'enterprise',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Company');
      expect(response.body.data.plan).toBe('enterprise');
    });
  });

  describe('DELETE /api/v1/tenants/:id', () => {
    it('should delete tenant', async () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const response = await request(app)
        .delete(`/api/v1/tenants/${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);

      // Verify deletion
      const found = TenantModel.findById(tenant.id);
      expect(found).toBeNull();
    });
  });

  describe('GET /api/v1/tenants/:id/stats', () => {
    it('should return tenant statistics', async () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      const response = await request(app)
        .get(`/api/v1/tenants/${tenant.id}/stats`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('users_count');
      expect(response.body.data).toHaveProperty('sessions_count');
      expect(response.body.data).toHaveProperty('messages_count');
      expect(response.body.data).toHaveProperty('active_sessions');
    });
  });

  describe('GET /api/v1/tenants/:id/settings', () => {
    it('should return tenant settings', async () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
        settings: {
          webhook_url: 'https://example.com',
          timezone: 'UTC',
        },
      });

      const response = await request(app)
        .get(`/api/v1/tenants/${tenant.id}/settings`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('webhook_url');
      expect(response.body.data).toHaveProperty('timezone');
    });
  });

  describe('PATCH /api/v1/tenants/:id/settings', () => {
    it('should update tenant settings', async () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
        settings: {
          webhook_url: 'https://old.com',
        },
      });

      const response = await request(app)
        .patch(`/api/v1/tenants/${tenant.id}/settings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          webhook_url: 'https://new.com',
          new_setting: 'value',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.webhook_url).toBe('https://new.com');
      expect(response.body.data.new_setting).toBe('value');
    });
  });
});
