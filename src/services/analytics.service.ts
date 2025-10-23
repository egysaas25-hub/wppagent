import db from '../config/database';
import logger from '../config/logger';

export interface AnalyticsEvent {
  id?: number;
  tenant_id: string;
  session_name?: string;
  event_type: string;
  event_data?: any;
  timestamp: number;
  created_at?: string;
}

export interface DashboardMetrics {
  overview: {
    total_messages: number;
    total_sessions: number;
    active_sessions: number;
    total_contacts: number;
    total_conversations: number;
  };
  message_stats: {
    sent: number;
    received: number;
    today: number;
    this_week: number;
    this_month: number;
  };
  session_stats: {
    connected: number;
    disconnected: number;
    qr_code: number;
    error: number;
  };
  hourly_activity: Array<{ hour: number; count: number }>;
  top_contacts: Array<{ contact_id: string; name: string; message_count: number }>;
  conversation_stats: {
    open: number;
    closed: number;
    average_response_time: number;
  };
}

export class AnalyticsService {
  /**
   * Track an analytics event
   */
  static trackEvent(event: AnalyticsEvent): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO analytics_events (tenant_id, session_name, event_type, event_data, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        event.tenant_id,
        event.session_name || null,
        event.event_type,
        event.event_data ? JSON.stringify(event.event_data) : null,
        event.timestamp
      );

      logger.debug('Analytics event tracked', {
        tenantId: event.tenant_id,
        eventType: event.event_type,
      });
    } catch (error: any) {
      logger.error('Failed to track analytics event', { error: error.message });
    }
  }

  /**
   * Get dashboard metrics for a tenant
   */
  static getDashboardMetrics(tenantId: string): DashboardMetrics {
    // Overview stats
    const totalMessages = db
      .prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
      `)
      .get(tenantId) as { count: number };

    const totalSessions = db
      .prepare('SELECT COUNT(*) as count FROM sessions WHERE tenant_id = ?')
      .get(tenantId) as { count: number };

    const activeSessions = db
      .prepare(`
        SELECT COUNT(*) as count FROM sessions
        WHERE tenant_id = ? AND status = 'connected'
      `)
      .get(tenantId) as { count: number };

    const totalContacts = db
      .prepare(`
        SELECT COUNT(DISTINCT contact_id) as count FROM contacts
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
      `)
      .get(tenantId) as { count: number };

    const totalConversations = db
      .prepare(`
        SELECT COUNT(*) as count FROM conversations
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
      `)
      .get(tenantId) as { count: number };

    // Message stats
    const sentMessages = db
      .prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND from_me = 1
      `)
      .get(tenantId) as { count: number };

    const receivedMessages = db
      .prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND from_me = 0
      `)
      .get(tenantId) as { count: number };

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;
    const monthStart = now - 30 * 24 * 60 * 60 * 1000;

    const todayMessages = db
      .prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND timestamp >= ?
      `)
      .get(tenantId, todayStart) as { count: number };

    const weekMessages = db
      .prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND timestamp >= ?
      `)
      .get(tenantId, weekStart) as { count: number };

    const monthMessages = db
      .prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND timestamp >= ?
      `)
      .get(tenantId, monthStart) as { count: number };

    // Session stats by status
    const sessionsByStatus = db
      .prepare(`
        SELECT status, COUNT(*) as count FROM sessions
        WHERE tenant_id = ?
        GROUP BY status
      `)
      .all(tenantId) as Array<{ status: string; count: number }>;

    const sessionStats = {
      connected: 0,
      disconnected: 0,
      qr_code: 0,
      error: 0,
    };

    sessionsByStatus.forEach((s) => {
      sessionStats[s.status as keyof typeof sessionStats] = s.count;
    });

    // Hourly activity (last 24 hours)
    const hourlyActivity = this.getHourlyActivity(tenantId);

    // Top contacts by message count
    const topContacts = db
      .prepare(`
        SELECT c.contact_id, c.name, COUNT(m.id) as message_count
        FROM contacts c
        LEFT JOIN messages m ON c.contact_id = m.sender
        WHERE c.session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        GROUP BY c.contact_id, c.name
        ORDER BY message_count DESC
        LIMIT 10
      `)
      .all(tenantId) as Array<{ contact_id: string; name: string; message_count: number }>;

    // Conversation stats
    const openConversations = db
      .prepare(`
        SELECT COUNT(*) as count FROM conversations
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND status = 'open'
      `)
      .get(tenantId) as { count: number };

    const closedConversations = db
      .prepare(`
        SELECT COUNT(*) as count FROM conversations
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND status != 'open'
      `)
      .get(tenantId) as { count: number };

    return {
      overview: {
        total_messages: totalMessages.count,
        total_sessions: totalSessions.count,
        active_sessions: activeSessions.count,
        total_contacts: totalContacts.count,
        total_conversations: totalConversations.count,
      },
      message_stats: {
        sent: sentMessages.count,
        received: receivedMessages.count,
        today: todayMessages.count,
        this_week: weekMessages.count,
        this_month: monthMessages.count,
      },
      session_stats: sessionStats,
      hourly_activity: hourlyActivity,
      top_contacts: topContacts,
      conversation_stats: {
        open: openConversations.count,
        closed: closedConversations.count,
        average_response_time: 0, // TODO: Calculate from message timestamps
      },
    };
  }

  /**
   * Get hourly activity for last 24 hours
   */
  private static getHourlyActivity(tenantId: string): Array<{ hour: number; count: number }> {
    const last24Hours = Date.now() - 24 * 60 * 60 * 1000;

    const activity = db
      .prepare(`
        SELECT
          CAST(strftime('%H', datetime(timestamp / 1000, 'unixepoch')) AS INTEGER) as hour,
          COUNT(*) as count
        FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND timestamp >= ?
        GROUP BY hour
        ORDER BY hour
      `)
      .all(tenantId, last24Hours) as Array<{ hour: number; count: number }>;

    // Fill in missing hours with 0
    const result = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    activity.forEach((a) => {
      result[a.hour].count = a.count;
    });

    return result;
  }

  /**
   * Get message trends over time
   */
  static getMessageTrends(
    tenantId: string,
    days: number = 7
  ): Array<{ date: string; sent: number; received: number }> {
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const trends = db
      .prepare(`
        SELECT
          DATE(timestamp / 1000, 'unixepoch') as date,
          SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) as received
        FROM messages
        WHERE session_name IN (SELECT session_name FROM sessions WHERE tenant_id = ?)
        AND timestamp >= ?
        GROUP BY date
        ORDER BY date
      `)
      .all(tenantId, startDate) as Array<{ date: string; sent: number; received: number }>;

    return trends;
  }

  /**
   * Get session activity log
   */
  static getSessionActivity(
    sessionName: string,
    limit: number = 50
  ): Array<{
    activity_type: string;
    details: any;
    timestamp: number;
    created_at: string;
  }> {
    const activities = db
      .prepare(`
        SELECT activity_type, details, timestamp, created_at
        FROM session_activity
        WHERE session_name = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `)
      .all(sessionName, limit) as Array<{
      activity_type: string;
      details: string;
      timestamp: number;
      created_at: string;
    }>;

    return activities.map((a) => ({
      activity_type: a.activity_type,
      details: a.details ? JSON.parse(a.details) : null,
      timestamp: a.timestamp,
      created_at: a.created_at,
    }));
  }

  /**
   * Track session activity
   */
  static trackSessionActivity(
    sessionName: string,
    tenantId: string,
    activityType: string,
    details?: any
  ): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO session_activity (session_name, tenant_id, activity_type, details, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        sessionName,
        tenantId,
        activityType,
        details ? JSON.stringify(details) : null,
        Date.now()
      );

      logger.debug('Session activity tracked', {
        sessionName,
        activityType,
      });
    } catch (error: any) {
      logger.error('Failed to track session activity', { error: error.message });
    }
  }

  /**
   * Get analytics events
   */
  static getEvents(
    tenantId: string,
    eventType?: string,
    limit: number = 100
  ): Array<AnalyticsEvent> {
    let query = `
      SELECT * FROM analytics_events
      WHERE tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (eventType) {
      query += ' AND event_type = ?';
      params.push(eventType);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const events = db.prepare(query).all(...params) as Array<any>;

    return events.map((e) => ({
      ...e,
      event_data: e.event_data ? JSON.parse(e.event_data) : null,
    }));
  }

  /**
   * Clean up old analytics data
   */
  static cleanupOldData(daysToKeep: number = 90): void {
    const cutoffDate = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    const analyticsDeleted = db
      .prepare('DELETE FROM analytics_events WHERE timestamp < ?')
      .run(cutoffDate);

    const activityDeleted = db
      .prepare('DELETE FROM session_activity WHERE timestamp < ?')
      .run(cutoffDate);

    logger.info('Analytics cleanup completed', {
      analyticsDeleted: analyticsDeleted.changes,
      activityDeleted: activityDeleted.changes,
      daysToKeep,
    });
  }
}
