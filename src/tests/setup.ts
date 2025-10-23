import { beforeAll, afterAll, beforeEach, afterEach, expect } from '@jest/globals';

// Set test environment variables BEFORE importing any config
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:'; // Use in-memory database for tests
process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only-min-32-chars';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import db from '../config/database';
import logger from '../config/logger';

// Silence logger during tests
logger.transports.forEach((t) => (t.silent = true));

// Test database setup
beforeAll(() => {
  // Environment already set above
});

afterAll(() => {
  // Close database connection
  if (db) {
    db.close();
  }
});

// Clean up between tests
beforeEach(() => {
  // Any setup needed before each test
});

afterEach(() => {
  // Clean up after each test
  // Clear all tables except schema
  const tables = [
    'online_users',
    'session_activity',
    'webhook_logs',
    'analytics_events',
    'backups',
    'conversations',
    'contacts',
    'messages',
    'sessions',
    'users',
    'tenants',
  ];

  tables.forEach((table) => {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
    } catch (error) {
      // Table might not exist in some tests
    }
  });
});

// Global test utilities
global.testUtils = {
  createTestUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    password_hash: '$2b$10$test',
    name: 'Test User',
    role: 'agent',
    status: 'active',
    tenant_id: 'test-tenant-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  createTestTenant: (overrides = {}) => ({
    id: 'test-tenant-id',
    name: 'Test Tenant',
    slug: 'test-tenant',
    email: 'tenant@example.com',
    plan: 'pro',
    max_sessions: 20,
    max_users: 10,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  createTestSession: (overrides = {}) => ({
    session_name: 'test-session',
    phone_number: '+5511999999999',
    status: 'connected',
    tenant_id: 'test-tenant-id',
    created_by: 'test-user-id',
    auto_reconnect: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Extend Jest matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
    };
  },

  toBeISO8601(received: string) {
    const pass = !isNaN(Date.parse(received));

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid ISO 8601 date`
          : `expected ${received} to be a valid ISO 8601 date`,
    };
  },
});

// TypeScript declarations
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createTestUser: (overrides?: any) => any;
        createTestTenant: (overrides?: any) => any;
        createTestSession: (overrides?: any) => any;
        sleep: (ms: number) => Promise<void>;
      };
    }
  }

  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeISO8601(): R;
    }
  }
}

export {};
