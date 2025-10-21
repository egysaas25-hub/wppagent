import { describe, it, expect, beforeEach } from '@jest/globals';
import { AnalyticsService } from '../../../services/analytics.service';
import { TenantModel } from '../../../models/tenant.model';
import { createTestDatabase, cleanTestDatabase, seedTestDatabase } from '../../helpers/test-database';
import Database from 'better-sqlite3';

describe('AnalyticsService', () => {
  let db: Database.Database;
  let tenantId: string;

  beforeEach(() => {
    db = createTestDatabase();
    cleanTestDatabase(db);
    seedTestDatabase(db);

    tenantId = 'test-tenant-id';
  });

  describe('trackEvent', () => {
    it('should track analytics event', () => {
      AnalyticsService.trackEvent({
        tenant_id: tenantId,
        session_name: 'test-session',
        event_type: 'message_sent',
        event_data: { to: '5511999999999', body: 'Hello' },
        timestamp: Date.now(),
      });

      const events = AnalyticsService.getEvents(tenantId, 'message_sent', 10);

      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('message_sent');
      expect(events[0].event_data).toHaveProperty('to');
    });

    it('should handle errors gracefully', () => {
      // Should not throw
      expect(() => {
        AnalyticsService.trackEvent({
          tenant_id: 'invalid-tenant',
          event_type: 'test_event',
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });
  });

  describe('getDashboardMetrics', () => {
    beforeEach(() => {
      // Insert test messages
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO messages (session_name, message_id, chat_id, from_me, sender, body, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'test-session',
          `msg-${i}`,
          '5511999999999@c.us',
          i % 2, // alternate sent/received
          '5511999999999@c.us',
          `Message ${i}`,
          Date.now() - i * 1000
        );
      }

      // Insert test contacts
      db.prepare(`
        INSERT INTO contacts (session_name, contact_id, name, phone)
        VALUES (?, ?, ?, ?)
      `).run('test-session', '5511999999999@c.us', 'Test Contact', '+5511999999999');
    });

    it('should return dashboard metrics', () => {
      const metrics = AnalyticsService.getDashboardMetrics(tenantId);

      expect(metrics).toHaveProperty('overview');
      expect(metrics).toHaveProperty('message_stats');
      expect(metrics).toHaveProperty('session_stats');
      expect(metrics).toHaveProperty('hourly_activity');
      expect(metrics).toHaveProperty('top_contacts');
      expect(metrics).toHaveProperty('conversation_stats');
    });

    it('should calculate message counts correctly', () => {
      const metrics = AnalyticsService.getDashboardMetrics(tenantId);

      expect(metrics.overview.total_messages).toBe(10);
      expect(metrics.message_stats.sent).toBe(5);
      expect(metrics.message_stats.received).toBe(5);
    });

    it('should return hourly activity', () => {
      const metrics = AnalyticsService.getDashboardMetrics(tenantId);

      expect(metrics.hourly_activity).toHaveLength(24);
      expect(metrics.hourly_activity[0]).toHaveProperty('hour');
      expect(metrics.hourly_activity[0]).toHaveProperty('count');
    });
  });

  describe('getMessageTrends', () => {
    beforeEach(() => {
      const now = Date.now();

      // Insert messages over 7 days
      for (let day = 0; day < 7; day++) {
        for (let i = 0; i < 5; i++) {
          db.prepare(`
            INSERT INTO messages (session_name, message_id, chat_id, from_me, timestamp)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            'test-session',
            `msg-${day}-${i}`,
            '5511999999999@c.us',
            i % 2,
            now - day * 24 * 60 * 60 * 1000
          );
        }
      }
    });

    it('should return message trends', () => {
      const trends = AnalyticsService.getMessageTrends(tenantId, 7);

      expect(trends.length).toBeGreaterThan(0);
      trends.forEach((trend) => {
        expect(trend).toHaveProperty('date');
        expect(trend).toHaveProperty('sent');
        expect(trend).toHaveProperty('received');
      });
    });
  });

  describe('getSessionActivity', () => {
    beforeEach(() => {
      // Insert session activity
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO session_activity (session_name, tenant_id, activity_type, details, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          'test-session',
          tenantId,
          'message_sent',
          JSON.stringify({ index: i }),
          Date.now() - i * 1000
        );
      }
    });

    it('should return session activity', () => {
      const activity = AnalyticsService.getSessionActivity('test-session', 10);

      expect(activity).toHaveLength(5);
      expect(activity[0]).toHaveProperty('activity_type');
      expect(activity[0]).toHaveProperty('details');
      expect(activity[0]).toHaveProperty('timestamp');
    });

    it('should limit results', () => {
      const activity = AnalyticsService.getSessionActivity('test-session', 2);

      expect(activity).toHaveLength(2);
    });
  });

  describe('trackSessionActivity', () => {
    it('should track session activity', () => {
      AnalyticsService.trackSessionActivity(
        'test-session',
        tenantId,
        'connected',
        { phone: '+5511999999999' }
      );

      const activity = AnalyticsService.getSessionActivity('test-session', 10);

      expect(activity).toHaveLength(1);
      expect(activity[0].activity_type).toBe('connected');
      expect(activity[0].details).toHaveProperty('phone');
    });
  });

  describe('cleanupOldData', () => {
    beforeEach(() => {
      const now = Date.now();
      const oldDate = now - 100 * 24 * 60 * 60 * 1000; // 100 days ago

      // Insert old event
      db.prepare(`
        INSERT INTO analytics_events (tenant_id, event_type, timestamp)
        VALUES (?, ?, ?)
      `).run(tenantId, 'old_event', oldDate);

      // Insert recent event
      db.prepare(`
        INSERT INTO analytics_events (tenant_id, event_type, timestamp)
        VALUES (?, ?, ?)
      `).run(tenantId, 'recent_event', now);
    });

    it('should delete old data', () => {
      AnalyticsService.cleanupOldData(90);

      const events = AnalyticsService.getEvents(tenantId, undefined, 100);

      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('recent_event');
    });
  });
});
