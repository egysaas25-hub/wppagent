import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../../app';
import { AnalyticsService } from '../../../services/analytics.service';
import { generateTestToken } from '../../helpers/test-server';
import { createTestDatabase, cleanTestDatabase, seedTestDatabase } from '../../helpers/test-database';

describe('Analytics Routes', () => {
  let token: string;
  let tenantId: string;

  beforeAll(() => {
    createTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase(db);
    seedTestDatabase(db);

    tenantId = 'test-tenant-id';
    token = generateTestToken({ tenant_id: tenantId });
  });

  describe('GET /api/v1/analytics/dashboard', () => {
    it('should return dashboard metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('overview');
      expect(response.body.data).toHaveProperty('message_stats');
      expect(response.body.data).toHaveProperty('session_stats');
      expect(response.body.data).toHaveProperty('hourly_activity');
    });

    it('should require tenant context', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${token}`);
      // Missing X-Tenant-ID header

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/analytics/trends', () => {
    beforeEach(() => {
      // Insert test messages
      const now = Date.now();
      for (let day = 0; day < 7; day++) {
        db.prepare(`
          INSERT INTO messages (session_name, message_id, chat_id, from_me, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          'test-session',
          `msg-${day}`,
          '5511999999999@c.us',
          0,
          now - day * 24 * 60 * 60 * 1000
        );
      }
    });

    it('should return message trends', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/trends?days=7')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should validate days parameter', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/trends?days=100') // max 90
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/analytics/sessions/:sessionName/activity', () => {
    beforeEach(() => {
      // Insert session activity
      db.prepare(`
        INSERT INTO session_activity (session_name, tenant_id, activity_type, timestamp)
        VALUES (?, ?, ?, ?)
      `).run('test-session', tenantId, 'connected', Date.now());
    });

    it('should return session activity', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/sessions/test-session/activity')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should limit results', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/sessions/test-session/activity?limit=5')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('POST /api/v1/analytics/events', () => {
    it('should track custom event', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/events')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId)
        .send({
          session_name: 'test-session',
          event_type: 'custom_event',
          event_data: { action: 'click', value: 'button' },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Verify event was tracked
      const events = AnalyticsService.getEvents(tenantId, 'custom_event', 10);
      expect(events).toHaveLength(1);
    });
  });

  describe('GET /api/v1/analytics/events', () => {
    beforeEach(() => {
      // Track some events
      AnalyticsService.trackEvent({
        tenant_id: tenantId,
        event_type: 'test_event',
        timestamp: Date.now(),
      });
    });

    it('should return events', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/events')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by event type', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/events?event_type=test_event')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      response.body.data.forEach((event: any) => {
        expect(event.event_type).toBe('test_event');
      });
    });
  });

  describe('DELETE /api/v1/analytics/cleanup', () => {
    beforeEach(() => {
      // Insert old event
      db.prepare(`
        INSERT INTO analytics_events (tenant_id, event_type, timestamp)
        VALUES (?, ?, ?)
      `).run(tenantId, 'old_event', Date.now() - 100 * 24 * 60 * 60 * 1000);
    });

    it('should cleanup old data', async () => {
      const response = await request(app)
        .delete('/api/v1/analytics/cleanup?days=90')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
