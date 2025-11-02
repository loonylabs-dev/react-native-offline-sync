import { Database, Model } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PullSynchronizer } from '../../src/core/PullSynchronizer';
import { ApiClient } from '../../src/types';
import { IConflictResolver } from '../../src/strategies/ConflictResolver';

describe('PullSynchronizer', () => {
  let pullSynchronizer: PullSynchronizer;
  let mockDatabase: jest.Mocked<Database>;
  let mockApiClient: jest.Mocked<ApiClient>;
  let mockConflictResolver: jest.Mocked<IConflictResolver>;
  let mockCollection: any;
  let mockRecords: Map<string, any>;

  beforeEach(() => {
    mockRecords = new Map();

    // Mock collection
    mockCollection = {
      create: jest.fn((callback) => {
        const mockRecord: any = {
          id: `local_${mockRecords.size + 1}`,
          _raw: {},
          table: 'posts',
          serverId: null,
          serverUpdatedAt: null,
          syncStatus: 'pending',
        };

        callback(mockRecord);
        mockRecords.set(mockRecord.id, mockRecord);

        return Promise.resolve(mockRecord);
      }),
      query: jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([])),
      })),
    };

    // Mock database
    mockDatabase = {
      write: jest.fn((callback) => callback()),
      get: jest.fn(() => mockCollection),
    } as any;

    // Mock API client
    mockApiClient = {
      push: jest.fn(),
      pull: jest.fn(() =>
        Promise.resolve({
          changes: {},
          timestamp: Date.now(),
        })
      ),
    } as any;

    // Mock conflict resolver
    mockConflictResolver = {
      resolve: jest.fn(() => 'server'),
    } as any;

    // Mock AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    pullSynchronizer = new PullSynchronizer(
      mockDatabase,
      mockApiClient,
      ['posts', 'comments'],
      mockConflictResolver,
      false
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('pull', () => {
    it('should fetch and apply changes from server', async () => {
      const serverTimestamp = Date.now();

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [{ id: 'server_1', title: 'Post 1', updated_at: serverTimestamp }],
            updated: [{ id: 'server_2', title: 'Updated Post', updated_at: serverTimestamp }],
            deleted: [], // Empty for simpler testing
          },
        },
        timestamp: serverTimestamp,
      });

      const result = await pullSynchronizer.pull();

      expect(mockApiClient.pull).toHaveBeenCalledWith({
        lastSyncAt: null,
        tables: ['posts', 'comments'],
      });

      expect(result.pulledCount).toBe(2); // 1 created + 1 updated
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@offlineSync:lastSyncAt',
        serverTimestamp.toString()
      );
    });

    it('should return zero count when no changes', async () => {
      mockApiClient.pull.mockResolvedValue({
        changes: {},
        timestamp: Date.now(),
      });

      const result = await pullSynchronizer.pull();

      expect(result.pulledCount).toBe(0);
    });

    it('should use last sync timestamp in request', async () => {
      const lastSyncAt = Date.now() - 1000;
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(lastSyncAt.toString());

      mockApiClient.pull.mockResolvedValue({
        changes: {},
        timestamp: Date.now(),
      });

      await pullSynchronizer.pull();

      expect(mockApiClient.pull).toHaveBeenCalledWith({
        lastSyncAt,
        tables: ['posts', 'comments'],
      });
    });

    it('should handle API errors', async () => {
      mockApiClient.pull.mockRejectedValue(new Error('Network error'));

      await expect(pullSynchronizer.pull()).rejects.toThrow('Network error');
    });
  });

  describe('applyCreated', () => {
    it('should create new records locally', async () => {
      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [
              { id: 'server_1', title: 'Post 1', content: 'Content 1', updated_at: Date.now() },
              { id: 'server_2', title: 'Post 2', content: 'Content 2', updated_at: Date.now() },
            ],
            updated: [],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      await pullSynchronizer.pull();

      expect(mockCollection.create).toHaveBeenCalledTimes(2);
    });

    it('should treat existing records as update', async () => {
      // Mock existing record with server_id
      const existingRecord = {
        id: 'local_1',
        _raw: {
          server_id: 'server_1',
          sync_status: 'synced',
        },
        table: 'posts',
        update: jest.fn((callback) => {
          callback(existingRecord);
          return Promise.resolve();
        }),
      };

      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([existingRecord])),
      }));

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [{ id: 'server_1', title: 'Updated via created', updated_at: Date.now() }],
            updated: [],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      await pullSynchronizer.pull();

      // Should update instead of create
      expect(existingRecord.update).toHaveBeenCalled();
      expect(mockCollection.create).not.toHaveBeenCalled();
    });

    it('should continue on individual record errors', async () => {
      mockCollection.create
        .mockRejectedValueOnce(new Error('Validation error'))
        .mockResolvedValueOnce({} as any);

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [
              { id: 'server_1', title: 'Post 1', updated_at: Date.now() },
              { id: 'server_2', title: 'Post 2', updated_at: Date.now() },
            ],
            updated: [],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      // Should not throw, continues with next record
      const result = await pullSynchronizer.pull();

      expect(result.pulledCount).toBe(2); // Still counts both
    });
  });

  describe('applyUpdated', () => {
    it('should update existing records', async () => {
      const existingRecord = {
        id: 'local_1',
        _raw: {
          server_id: 'server_1',
          sync_status: 'synced',
        },
        table: 'posts',
        update: jest.fn((callback) => {
          callback(existingRecord);
          return Promise.resolve();
        }),
      };

      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([existingRecord])),
      }));

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [],
            updated: [
              { id: 'server_1', title: 'Updated Title', content: 'Updated', updated_at: Date.now() },
            ],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      await pullSynchronizer.pull();

      expect(existingRecord.update).toHaveBeenCalled();
    });

    it('should create record if it does not exist locally', async () => {
      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([])), // No existing record
      }));

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [],
            updated: [{ id: 'server_1', title: 'New Post', updated_at: Date.now() }],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      await pullSynchronizer.pull();

      expect(mockCollection.create).toHaveBeenCalled();
    });
  });

  describe('applyDeleted', () => {
    it('should mark records as deleted', async () => {
      const recordToDelete = {
        id: 'local_1',
        _raw: { server_id: 'server_1' },
        markAsDeleted: jest.fn(() => Promise.resolve()),
      };

      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([recordToDelete])),
      }));

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [],
            updated: [],
            deleted: ['server_1'],
          },
        },
        timestamp: Date.now(),
      });

      await pullSynchronizer.pull();

      expect(recordToDelete.markAsDeleted).toHaveBeenCalled();
    });

    it('should handle multiple deleted records', async () => {
      const record1 = {
        id: 'local_1',
        markAsDeleted: jest.fn(() => Promise.resolve()),
      };
      const record2 = {
        id: 'local_2',
        markAsDeleted: jest.fn(() => Promise.resolve()),
      };

      mockCollection.query = jest.fn((query) => ({
        fetch: jest.fn(() => {
          // Return different records based on server_id
          return Promise.resolve([record1, record2]);
        }),
      }));

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [],
            updated: [],
            deleted: ['server_1', 'server_2'],
          },
        },
        timestamp: Date.now(),
      });

      await pullSynchronizer.pull();

      // Each deleted ID results in markAsDeleted calls
      expect(record1.markAsDeleted).toHaveBeenCalled();
      expect(record2.markAsDeleted).toHaveBeenCalled();
    });
  });

  describe('conflict resolution', () => {
    it('should detect and resolve conflicts', async () => {
      const localRecord = {
        id: 'local_1',
        table: 'posts',
        _raw: {
          server_id: 'server_1',
          sync_status: 'pending', // Has local changes
          server_updated_at: 1000,
          updated_at: 2000,
        },
        update: jest.fn((callback) => {
          callback(localRecord);
          return Promise.resolve();
        }),
      };

      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([localRecord])),
      }));

      // Server data is newer
      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [],
            updated: [{ id: 'server_1', title: 'Server Update', updated_at: 3000 }],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      mockConflictResolver.resolve.mockReturnValue('server');

      await pullSynchronizer.pull();

      expect(mockConflictResolver.resolve).toHaveBeenCalled();
      expect(localRecord.update).toHaveBeenCalled();
    });

    it('should keep local changes when conflict resolved to local', async () => {
      const localRecord = {
        id: 'local_1',
        table: 'posts',
        _raw: {
          server_id: 'server_1',
          sync_status: 'pending',
          server_updated_at: 1000,
        },
        update: jest.fn(),
      };

      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([localRecord])),
      }));

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [],
            updated: [{ id: 'server_1', title: 'Server Update', updated_at: 3000 }],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      mockConflictResolver.resolve.mockReturnValue('local');

      await pullSynchronizer.pull();

      // Should not update when keeping local
      expect(localRecord.update).not.toHaveBeenCalled();
    });

    it('should apply custom resolution data', async () => {
      const localRecord = {
        id: 'local_1',
        table: 'posts',
        _raw: {
          server_id: 'server_1',
          sync_status: 'pending',
          server_updated_at: 1000,
        },
        update: jest.fn((callback) => {
          callback(localRecord);
          return Promise.resolve();
        }),
      };

      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([localRecord])),
      }));

      mockApiClient.pull.mockResolvedValue({
        changes: {
          posts: {
            created: [],
            updated: [{ id: 'server_1', title: 'Server Update', updated_at: 3000 }],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      });

      // Custom resolution returns merged data
      mockConflictResolver.resolve.mockReturnValue({
        id: 'server_1',
        title: 'Merged Title',
        updated_at: 3000,
      });

      await pullSynchronizer.pull();

      expect(localRecord.update).toHaveBeenCalled();
    });
  });

  describe('timestamp management', () => {
    it('should save last sync timestamp', async () => {
      const timestamp = Date.now();

      mockApiClient.pull.mockResolvedValue({
        changes: {},
        timestamp,
      });

      await pullSynchronizer.pull();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@offlineSync:lastSyncAt',
        timestamp.toString()
      );
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      mockApiClient.pull.mockResolvedValue({
        changes: {},
        timestamp: Date.now(),
      });

      // Should not throw
      await expect(pullSynchronizer.pull()).resolves.toBeDefined();
    });
  });
});
