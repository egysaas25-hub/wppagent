import express, { Application } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from '../../config/environment';

/**
 * Create a test Express application
 */
export function createTestApp(): Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  return app;
}

/**
 * Generate a test JWT token
 */
export function generateTestToken(payload: any = {}): string {
  const defaultPayload = {
    id: 'test-user-id',
    email: 'test@test.com',
    name: 'Test User',
    role: 'admin',
    tenant_id: 'test-tenant-id',
    ...payload,
  };

  return jwt.sign(defaultPayload, config.jwt.secret, {
    expiresIn: '1h',
  });
}

/**
 * Make authenticated request
 */
export function authenticatedRequest(app: Application, token?: string) {
  const testToken = token || generateTestToken();

  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${testToken}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${testToken}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${testToken}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${testToken}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${testToken}`),
  };
}

/**
 * Expect error response format
 */
export function expectErrorResponse(response: request.Response, statusCode: number, message?: string) {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty('success', false);
  expect(response.body).toHaveProperty('error');
  if (message) {
    expect(response.body.error.message).toContain(message);
  }
}

/**
 * Expect success response format
 */
export function expectSuccessResponse(response: request.Response, statusCode: number = 200) {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty('success', true);
  expect(response.body).toHaveProperty('data');
}
