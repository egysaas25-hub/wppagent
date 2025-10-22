import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../../app';
import healthService from '../../../services/health.service';

// Mock the health service
jest.mock('../../../services/health.service');

describe('Health Routes Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/health', () => {
    it('should return basic health status', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
    });

    it('should return ISO 8601 timestamp', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.body.timestamp).toBeISO8601();
    });

    it('should not require authentication', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/v1/health/detailed', () => {
    it('should return detailed health status when system is healthy', async () => {
      const mockHealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {
          database: {
            status: 'healthy',
            responseTime: 5,
            message: 'Database connection is healthy',
          },
          memory: {
            status: 'healthy',
            usage: {
              rss: 52428800,
              heapTotal: 20971520,
              heapUsed: 15728640,
              external: 1048576,
            },
            percentUsed: 30,
            message: 'Memory usage is normal',
          },
          cpu: {
            status: 'healthy',
            usage: 15.5,
            message: 'CPU usage is normal',
          },
          sessions: {
            status: 'healthy',
            active: 5,
            total: 10,
            message: '5 active sessions',
          },
        },
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/detailed');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockHealthStatus);
      expect(response.body.status).toBe('healthy');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('memory');
      expect(response.body.checks).toHaveProperty('cpu');
      expect(response.body.checks).toHaveProperty('sessions');
    });

    it('should return 200 when system is degraded', async () => {
      const mockHealthStatus = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {
          database: {
            status: 'healthy',
            responseTime: 5,
          },
          memory: {
            status: 'degraded',
            usage: {
              rss: 104857600,
              heapTotal: 41943040,
              heapUsed: 36700160,
              external: 2097152,
            },
            percentUsed: 85,
            message: 'Memory usage is high',
          },
        },
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/detailed');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
    });

    it('should return 503 when system is unhealthy', async () => {
      const mockHealthStatus = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {
          database: {
            status: 'unhealthy',
            responseTime: 0,
            error: 'Database connection failed',
            message: 'Cannot connect to database',
          },
          memory: {
            status: 'healthy',
            usage: {
              rss: 52428800,
              heapTotal: 20971520,
              heapUsed: 15728640,
              external: 1048576,
            },
            percentUsed: 30,
          },
        },
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/detailed');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
    });

    it('should not require authentication', async () => {
      const mockHealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {},
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/detailed');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/v1/health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app).get('/api/v1/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.timestamp).toBeISO8601();
    });

    it('should not require authentication', async () => {
      const response = await request(app).get('/api/v1/health/live');

      expect(response.status).toBe(200);
    });

    it('should always return 200 when app is running', async () => {
      const response = await request(app).get('/api/v1/health/live');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return ready status when system is healthy', async () => {
      const mockHealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {
          database: {
            status: 'healthy',
            responseTime: 5,
          },
        },
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return ready status when system is degraded', async () => {
      const mockHealthStatus = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {
          memory: {
            status: 'degraded',
            percentUsed: 85,
          },
        },
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
    });

    it('should return 503 when system is unhealthy', async () => {
      const mockHealthStatus = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {
          database: {
            status: 'unhealthy',
            error: 'Database connection failed',
          },
        },
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not ready');
      expect(response.body).toHaveProperty('reason', 'System is unhealthy');
    });

    it('should not require authentication', async () => {
      const mockHealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        checks: {},
      };

      (healthService.getHealthStatus as jest.MockedFunction<typeof healthService.getHealthStatus>)
        .mockResolvedValue(mockHealthStatus);

      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
    });
  });

  describe('Health Endpoints Performance', () => {
    it('should respond quickly to liveness check', async () => {
      const startTime = Date.now();
      const response = await request(app).get('/api/v1/health/live');
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100); // Should respond in less than 100ms
    });

    it('should respond quickly to basic health check', async () => {
      const startTime = Date.now();
      const response = await request(app).get('/api/v1/health');
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100); // Should respond in less than 100ms
    });
  });
});
