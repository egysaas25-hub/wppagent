import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Server } from 'http';
import { io as ioClient, Socket } from 'socket.io-client';
import app from '../../app';
import { generateTestToken } from '../helpers/test-server';

describe('WebSocket Integration', () => {
  let server: Server;
  let clientSocket: Socket;
  const PORT = 3001;
  let token: string;

  beforeAll((done) => {
    server = app.listen(PORT, () => {
      token = generateTestToken();
      done();
    });
  });

  afterAll((done) => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    server.close(done);
  });

  describe('Connection', () => {
    it('should connect with valid token', (done) => {
      clientSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should reject connection without token', (done) => {
      const unauthorizedSocket = ioClient(`http://localhost:${PORT}`);

      unauthorizedSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication required');
        unauthorizedSocket.disconnect();
        done();
      });

      unauthorizedSocket.on('connect', () => {
        unauthorizedSocket.disconnect();
        done(new Error('Should not connect without token'));
      });
    });
  });

  describe('Session Events', () => {
    beforeAll((done) => {
      clientSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token },
      });

      clientSocket.on('connect', done);
    });

    it('should join session room', (done) => {
      clientSocket.emit('join-session', 'test-session');

      clientSocket.on('session-status', (data) => {
        expect(data).toHaveProperty('sessionName');
        expect(data).toHaveProperty('isActive');
        done();
      });
    });

    it('should leave session room', (done) => {
      clientSocket.emit('leave-session', 'test-session');

      // Wait a bit and verify no more events
      setTimeout(done, 100);
    });

    it('should get active sessions', (done) => {
      clientSocket.emit('get-active-sessions');

      clientSocket.on('active-sessions', (sessions) => {
        expect(Array.isArray(sessions)).toBe(true);
        done();
      });
    });
  });

  describe('Presence', () => {
    beforeAll((done) => {
      clientSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token },
      });

      clientSocket.on('connect', done);
    });

    it('should update user status', (done) => {
      clientSocket.emit('presence:status', 'away');

      // Wait for presence update
      setTimeout(done, 100);
    });

    it('should get online users', (done) => {
      clientSocket.emit('presence:get-online');

      clientSocket.on('presence:online-users', (users) => {
        expect(Array.isArray(users)).toBe(true);
        done();
      });
    });
  });

  describe('Typing Indicators', () => {
    beforeAll((done) => {
      clientSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token },
      });

      clientSocket.on('connect', done);
    });

    it('should send typing start', (done) => {
      clientSocket.emit('typing:start', {
        session_name: 'test-session',
        chat_id: '5511999999999@c.us',
      });

      // Wait a bit
      setTimeout(done, 100);
    });

    it('should send typing stop', (done) => {
      clientSocket.emit('typing:stop', {
        session_name: 'test-session',
        chat_id: '5511999999999@c.us',
      });

      // Wait a bit
      setTimeout(done, 100);
    });
  });

  describe('Analytics Subscription', () => {
    beforeAll((done) => {
      clientSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token },
      });

      clientSocket.on('connect', done);
    });

    it('should subscribe to analytics', (done) => {
      clientSocket.emit('analytics:subscribe');

      clientSocket.on('analytics:dashboard', (metrics) => {
        expect(metrics).toHaveProperty('overview');
        expect(metrics).toHaveProperty('message_stats');
        done();
      });
    });

    it('should unsubscribe from analytics', (done) => {
      clientSocket.emit('analytics:unsubscribe');

      // Wait a bit
      setTimeout(done, 100);
    });
  });
});
