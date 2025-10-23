import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../../app';
import { createTestDatabase, cleanTestDatabase } from '../../helpers/test-database';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

describe('Auth Routes Integration', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  beforeEach(() => {
    cleanTestDatabase(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123',
          name: 'New User',
          role: 'agent',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe('newuser@example.com');
    });

    it('should reject registration with weak password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          name: 'Test User',
          role: 'agent',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'SecurePass123',
          name: 'Test User',
          role: 'agent',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject registration with duplicate email', async () => {
      // First registration
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'SecurePass123',
          name: 'First User',
          role: 'agent',
        });

      // Second registration with same email
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'SecurePass123',
          name: 'Second User',
          role: 'agent',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const passwordHash = await bcrypt.hash('SecurePass123', 10);
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, status, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-user-id',
        'testuser@example.com',
        passwordHash,
        'Test User',
        'agent',
        'active',
        'test-tenant-id',
        new Date().toISOString(),
        new Date().toISOString()
      );
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'SecurePass123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe('testuser@example.com');
    });

    it('should reject login with incorrect password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'WrongPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SecurePass123',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let token: string;

    beforeEach(async () => {
      // Create and login a test user
      const passwordHash = await bcrypt.hash('SecurePass123', 10);
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, status, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-user-id',
        'testuser@example.com',
        passwordHash,
        'Test User',
        'agent',
        'active',
        'test-tenant-id',
        new Date().toISOString(),
        new Date().toISOString()
      );

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'SecurePass123',
        });

      token = loginResponse.body.data.token;
    });

    it('should get current user with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('testuser@example.com');
    });

    it('should reject request without token', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    let token: string;

    beforeEach(async () => {
      // Create and login a test user
      const passwordHash = await bcrypt.hash('OldPassword123', 10);
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, status, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-user-id',
        'testuser@example.com',
        passwordHash,
        'Test User',
        'agent',
        'active',
        'test-tenant-id',
        new Date().toISOString(),
        new Date().toISOString()
      );

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'OldPassword123',
        });

      token = loginResponse.body.data.token;
    });

    it('should change password with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'OldPassword123',
          newPassword: 'NewPassword123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject password change with incorrect old password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'WrongOldPassword123',
          newPassword: 'NewPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject weak new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          oldPassword: 'OldPassword123',
          newPassword: 'weak',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let token: string;

    beforeEach(async () => {
      // Create and login a test user
      const passwordHash = await bcrypt.hash('SecurePass123', 10);
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, status, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-user-id',
        'testuser@example.com',
        passwordHash,
        'Test User',
        'agent',
        'active',
        'test-tenant-id',
        new Date().toISOString(),
        new Date().toISOString()
      );

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'SecurePass123',
        });

      token = loginResponse.body.data.token;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject logout without token', async () => {
      const response = await request(app).post('/api/v1/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
