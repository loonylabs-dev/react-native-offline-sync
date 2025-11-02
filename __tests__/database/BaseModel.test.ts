import { BaseModel } from '../../src/database/models/BaseModel';

describe('BaseModel', () => {
  let mockModel: BaseModel;

  beforeEach(() => {
    // Create a mock instance with all properties
    mockModel = new BaseModel(
      {
        database: {} as any,
        _raw: {
          id: 'test-id',
          _status: 'created',
          _changed: '',
          server_id: null,
          server_updated_at: null,
          sync_status: null,
          last_sync_error: null,
        },
      } as any,
      []
    );
  });

  describe('sync metadata fields', () => {
    it('should have serverId field', () => {
      expect(mockModel).toHaveProperty('serverId');
      // Note: Decorators don't work in test environment, field will be undefined
    });

    it('should have serverUpdatedAt field', () => {
      expect(mockModel).toHaveProperty('serverUpdatedAt');
    });

    it('should have offlineSyncStatus field', () => {
      expect(mockModel).toHaveProperty('offlineSyncStatus');
    });

    it('should have lastSyncError field', () => {
      expect(mockModel).toHaveProperty('lastSyncError');
    });
  });

  describe('isSynced getter', () => {
    it('should return true when synced and has serverId', () => {
      mockModel._raw.sync_status = 'synced';
      mockModel._raw.server_id = 'server-123';

      expect(mockModel.isSynced).toBe(true);
    });

    it('should return false when synced but no serverId', () => {
      mockModel._raw.sync_status = 'synced';
      mockModel._raw.server_id = null;

      expect(mockModel.isSynced).toBe(false);
    });

    it('should return false when has serverId but not synced', () => {
      mockModel._raw.sync_status = 'pending';
      mockModel._raw.server_id = 'server-123';

      expect(mockModel.isSynced).toBe(false);
    });

    it('should return false when neither synced nor has serverId', () => {
      mockModel._raw.sync_status = 'pending';
      mockModel._raw.server_id = null;

      expect(mockModel.isSynced).toBe(false);
    });

    it('should return false when sync status is null', () => {
      mockModel._raw.sync_status = null;
      mockModel._raw.server_id = 'server-123';

      expect(mockModel.isSynced).toBe(false);
    });

    it('should return false when sync status is failed', () => {
      mockModel._raw.sync_status = 'failed';
      mockModel._raw.server_id = 'server-123';

      expect(mockModel.isSynced).toBe(false);
    });
  });

  describe('hasSyncError getter', () => {
    it('should return true when status is failed', () => {
      mockModel._raw.sync_status = 'failed';

      expect(mockModel.hasSyncError).toBe(true);
    });

    it('should return false when status is synced', () => {
      mockModel._raw.sync_status = 'synced';

      expect(mockModel.hasSyncError).toBe(false);
    });

    it('should return false when status is pending', () => {
      mockModel._raw.sync_status = 'pending';

      expect(mockModel.hasSyncError).toBe(false);
    });

    it('should return false when status is null', () => {
      mockModel._raw.sync_status = null;

      expect(mockModel.hasSyncError).toBe(false);
    });
  });

  describe('isPendingSync getter', () => {
    it('should return true when status is pending', () => {
      mockModel._raw.sync_status = 'pending';

      expect(mockModel.isPendingSync).toBe(true);
    });

    it('should return false when status is synced', () => {
      mockModel._raw.sync_status = 'synced';

      expect(mockModel.isPendingSync).toBe(false);
    });

    it('should return false when status is failed', () => {
      mockModel._raw.sync_status = 'failed';

      expect(mockModel.isPendingSync).toBe(false);
    });

    it('should return false when status is null', () => {
      mockModel._raw.sync_status = null;

      expect(mockModel.isPendingSync).toBe(false);
    });
  });

  describe('sync status transitions', () => {
    it('should handle pending -> synced transition', () => {
      mockModel._raw.sync_status = 'pending';
      mockModel._raw.server_id = null;

      expect(mockModel.isPendingSync).toBe(true);
      expect(mockModel.isSynced).toBe(false);
      expect(mockModel.hasSyncError).toBe(false);

      mockModel._raw.sync_status = 'synced';
      mockModel._raw.server_id = 'server-123';

      expect(mockModel.isPendingSync).toBe(false);
      expect(mockModel.isSynced).toBe(true);
      expect(mockModel.hasSyncError).toBe(false);
    });

    it('should handle pending -> failed transition', () => {
      mockModel._raw.sync_status = 'pending';

      expect(mockModel.isPendingSync).toBe(true);
      expect(mockModel.hasSyncError).toBe(false);

      mockModel._raw.sync_status = 'failed';
      mockModel._raw.last_sync_error = 'Network error';

      expect(mockModel.isPendingSync).toBe(false);
      expect(mockModel.hasSyncError).toBe(true);
    });

    it('should handle failed -> pending -> synced transition', () => {
      mockModel._raw.sync_status = 'failed';
      mockModel._raw.last_sync_error = 'Network error';

      expect(mockModel.hasSyncError).toBe(true);

      mockModel._raw.sync_status = 'pending';
      mockModel._raw.last_sync_error = null;

      expect(mockModel.isPendingSync).toBe(true);
      expect(mockModel.hasSyncError).toBe(false);

      mockModel._raw.sync_status = 'synced';
      mockModel._raw.server_id = 'server-123';

      expect(mockModel.isSynced).toBe(true);
      expect(mockModel.isPendingSync).toBe(false);
    });
  });

  describe('sync error handling', () => {
    it('should store error message when sync fails', () => {
      mockModel._raw.sync_status = 'failed';
      mockModel._raw.last_sync_error = 'Server returned 500';

      expect(mockModel.hasSyncError).toBe(true);
      expect(mockModel._raw.last_sync_error).toBe('Server returned 500');
    });

    it('should clear error message when sync succeeds', () => {
      mockModel._raw.sync_status = 'failed';
      mockModel._raw.last_sync_error = 'Network error';

      mockModel._raw.sync_status = 'synced';
      mockModel._raw.server_id = 'server-123';
      mockModel._raw.last_sync_error = null;

      expect(mockModel.hasSyncError).toBe(false);
      expect(mockModel._raw.last_sync_error).toBeNull();
    });
  });

  describe('server metadata', () => {
    it('should store server ID when synced', () => {
      mockModel._raw.server_id = 'server-abc-123';

      expect(mockModel._raw.server_id).toBe('server-abc-123');
    });

    it('should store server updated timestamp', () => {
      const timestamp = Date.now();
      mockModel._raw.server_updated_at = timestamp;

      expect(mockModel._raw.server_updated_at).toBe(timestamp);
    });

    it('should handle null server values', () => {
      mockModel._raw.server_id = null;
      mockModel._raw.server_updated_at = null;

      expect(mockModel._raw.server_id).toBeNull();
      expect(mockModel._raw.server_updated_at).toBeNull();
    });
  });
});
