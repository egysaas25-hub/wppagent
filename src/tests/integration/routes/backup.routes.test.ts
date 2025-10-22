import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../../app';
import { generateTestToken } from '../../helpers/test-server';
import { BackupService } from '../../../services/backup.service';

// Mock the BackupService
jest.mock('../../../services/backup.service');

describe('Backup Routes Integration', () => {
  let adminToken: string;
  let agentToken: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Generate test tokens
    adminToken = generateTestToken({ role: 'admin', id: 'admin-user-id' });
    agentToken = generateTestToken({ role: 'agent', id: 'agent-user-id' });
  });

  describe('POST /api/v1/backups', () => {
    it('should create a backup (admin only)', async () => {
      const mockBackup = {
        id: 1,
        tenant_id: null,
        type: 'full',
        status: 'completed',
        file_path: '/backups/backup_20250101_120000.db',
        file_size: 1048576,
        created_at: new Date().toISOString(),
      };

      (BackupService.createBackup as jest.MockedFunction<typeof BackupService.createBackup>)
        .mockResolvedValue(mockBackup);

      const response = await request(app)
        .post('/api/v1/backups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'full',
          compress: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockBackup);
      expect(BackupService.createBackup).toHaveBeenCalledWith({
        tenantId: undefined,
        type: 'full',
        compress: true,
      });
    });

    it('should create a tenant-specific backup', async () => {
      const mockBackup = {
        id: 2,
        tenant_id: 'tenant-123',
        type: 'incremental',
        status: 'completed',
        file_path: '/backups/tenant_tenant-123_20250101_120000.json',
        file_size: 524288,
        created_at: new Date().toISOString(),
      };

      (BackupService.createBackup as jest.MockedFunction<typeof BackupService.createBackup>)
        .mockResolvedValue(mockBackup);

      const response = await request(app)
        .post('/api/v1/backups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenant_id: 'tenant-123',
          type: 'incremental',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenant_id).toBe('tenant-123');
    });

    it('should reject backup creation for non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/backups')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          type: 'full',
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should reject backup creation without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/backups')
        .send({
          type: 'full',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should validate backup type', async () => {
      const response = await request(app)
        .post('/api/v1/backups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'invalid-type',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/backups', () => {
    it('should list all backups (admin only)', async () => {
      const mockBackups = [
        {
          id: 1,
          tenant_id: null,
          type: 'full',
          status: 'completed',
          file_path: '/backups/backup_20250101_120000.db',
          file_size: 1048576,
          created_at: '2025-01-01T12:00:00Z',
        },
        {
          id: 2,
          tenant_id: 'tenant-123',
          type: 'incremental',
          status: 'completed',
          file_path: '/backups/tenant_tenant-123_20250101_130000.json',
          file_size: 524288,
          created_at: '2025-01-01T13:00:00Z',
        },
      ];

      (BackupService.listBackups as jest.MockedFunction<typeof BackupService.listBackups>)
        .mockReturnValue(mockBackups);

      const response = await request(app)
        .get('/api/v1/backups')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockBackups);
      expect(BackupService.listBackups).toHaveBeenCalledWith(undefined, 50);
    });

    it('should list backups for specific tenant', async () => {
      const mockBackups = [
        {
          id: 2,
          tenant_id: 'tenant-123',
          type: 'incremental',
          status: 'completed',
          file_path: '/backups/tenant_tenant-123_20250101_130000.json',
          file_size: 524288,
          created_at: '2025-01-01T13:00:00Z',
        },
      ];

      (BackupService.listBackups as jest.MockedFunction<typeof BackupService.listBackups>)
        .mockReturnValue(mockBackups);

      const response = await request(app)
        .get('/api/v1/backups?tenant_id=tenant-123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockBackups);
      expect(BackupService.listBackups).toHaveBeenCalledWith('tenant-123', 50);
    });

    it('should respect limit parameter', async () => {
      (BackupService.listBackups as jest.MockedFunction<typeof BackupService.listBackups>)
        .mockReturnValue([]);

      const response = await request(app)
        .get('/api/v1/backups?limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(BackupService.listBackups).toHaveBeenCalledWith(undefined, 10);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/backups')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/backups/stats', () => {
    it('should get backup statistics (admin only)', async () => {
      const mockStats = {
        total_backups: 10,
        total_size: 10485760,
        backups_by_type: {
          full: 5,
          incremental: 4,
          manual: 1,
        },
        backups_by_status: {
          completed: 9,
          in_progress: 1,
          failed: 0,
        },
        latest_backup: '2025-01-01T12:00:00Z',
        oldest_backup: '2024-12-01T12:00:00Z',
      };

      (BackupService.getBackupStats as jest.MockedFunction<typeof BackupService.getBackupStats>)
        .mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/v1/backups/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/backups/stats')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/backups/:id/restore', () => {
    it('should restore from backup (admin only)', async () => {
      (BackupService.restoreBackup as jest.MockedFunction<typeof BackupService.restoreBackup>)
        .mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/backups/1/restore')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('restored successfully');
      expect(BackupService.restoreBackup).toHaveBeenCalledWith(1);
    });

    it('should reject invalid backup ID', async () => {
      const response = await request(app)
        .post('/api/v1/backups/invalid/restore')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/backups/1/restore')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/backups/export-tenant', () => {
    it('should export tenant data (admin only)', async () => {
      const exportPath = '/exports/tenant_tenant-123_20250101_120000.json';

      (BackupService.exportTenantData as jest.MockedFunction<typeof BackupService.exportTenantData>)
        .mockResolvedValue(exportPath);

      const response = await request(app)
        .post('/api/v1/backups/export-tenant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenant_id: 'tenant-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.export_path).toBe(exportPath);
      expect(BackupService.exportTenantData).toHaveBeenCalledWith('tenant-123');
    });

    it('should reject without tenant_id', async () => {
      const response = await request(app)
        .post('/api/v1/backups/export-tenant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .post('/api/v1/backups/export-tenant')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          tenant_id: 'tenant-123',
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/backups/cleanup', () => {
    it('should delete old backups (admin only)', async () => {
      (BackupService.deleteOldBackups as jest.MockedFunction<typeof BackupService.deleteOldBackups>)
        .mockReturnValue(undefined);

      const response = await request(app)
        .delete('/api/v1/backups/cleanup?days=30')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('30 days');
      expect(BackupService.deleteOldBackups).toHaveBeenCalledWith(30);
    });

    it('should use default retention period if not specified', async () => {
      (BackupService.deleteOldBackups as jest.MockedFunction<typeof BackupService.deleteOldBackups>)
        .mockReturnValue(undefined);

      const response = await request(app)
        .delete('/api/v1/backups/cleanup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(BackupService.deleteOldBackups).toHaveBeenCalledWith(30);
    });

    it('should validate days parameter', async () => {
      const response = await request(app)
        .delete('/api/v1/backups/cleanup?days=invalid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .delete('/api/v1/backups/cleanup')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
