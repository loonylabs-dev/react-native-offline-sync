import { Database, Model } from '@nozbe/watermelondb';
import { PushSynchronizer } from '../../src/core/PushSynchronizer';
import { SyncQueueManager } from '../../src/core/SyncQueueManager';
import { ApiClient, SyncOperation, SyncQueueItem } from '../../src/types';

describe('PushSynchronizer', () => {
  let pushSynchronizer: PushSynchronizer;
  let mockDatabase: jest.Mocked<Database>;
  let mockQueueManager: jest.Mocked<SyncQueueManager>;
  let mockApiClient: jest.Mocked<ApiClient>;
  let mockCollection: any;
  let mockRecords: Map<string, any>;

  beforeEach(() => {
    mockRecords = new Map();

    // Mock collection
    mockCollection = {
      find: jest.fn((id: string) => {
        const record = mockRecords.get(id);
        if (!record) throw new Error('Not found');
        return Promise.resolve({
          ...record,
          update: jest.fn((callback) => {
            callback(record);
            return Promise.resolve();
          }),
        });
      }),
    };

    // Mock database
    mockDatabase = {
      write: jest.fn((callback) => callback()),
      get: jest.fn(() => mockCollection),
    } as any;

    // Mock queue manager
    mockQueueManager = {
      getPendingItems: jest.fn(() => Promise.resolve([])),
      markAsProcessed: jest.fn(() => Promise.resolve()),
      incrementRetry: jest.fn(() => Promise.resolve()),
    } as any;

    // Mock API client
    mockApiClient = {
      push: jest.fn(() =>
        Promise.resolve({
          success: true,
          results: [],
        })
      ),
      pull: jest.fn(),
    } as any;

    pushSynchronizer = new PushSynchronizer(
      mockDatabase,
      mockQueueManager,
      mockApiClient,
      3, // maxRetries
      50, // batchSize
      false // debug
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('push', () => {
    it('should return zero counts when no pending items', async () => {
      mockQueueManager.getPendingItems.mockResolvedValue([]);

      const result = await pushSynchronizer.push();

      expect(result).toEqual({ pushedCount: 0, failedCount: 0 });
      expect(mockQueueManager.getPendingItems).toHaveBeenCalledWith(3);
      expect(mockApiClient.push).not.toHaveBeenCalled();
    });

    it('should push pending items successfully', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'item_2',
          operation: SyncOperation.UPDATE,
          tableName: 'posts',
          recordId: 'post_2',
          payload: { title: 'Post 2 Updated' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);

      mockApiClient.push.mockResolvedValue({
        success: true,
        results: [
          { serverId: 'server_1', serverUpdatedAt: Date.now() },
          { serverId: 'server_2', serverUpdatedAt: Date.now() },
        ],
      });

      // Mock local records
      mockRecords.set('post_1', { id: 'post_1', serverId: null, syncStatus: 'pending' });
      mockRecords.set('post_2', { id: 'post_2', serverId: null, syncStatus: 'pending' });

      const result = await pushSynchronizer.push();

      expect(result).toEqual({ pushedCount: 2, failedCount: 0 });
      expect(mockApiClient.push).toHaveBeenCalledTimes(1);
      expect(mockQueueManager.markAsProcessed).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'item_2',
          operation: SyncOperation.UPDATE,
          tableName: 'posts',
          recordId: 'post_2',
          payload: { title: 'Post 2' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);

      mockApiClient.push.mockResolvedValue({
        success: true,
        results: [
          { serverId: 'server_1', serverUpdatedAt: Date.now() }, // Success
          { error: 'Validation error' }, // Failure
        ],
      });

      mockRecords.set('post_1', { id: 'post_1', serverId: null, syncStatus: 'pending' });

      const result = await pushSynchronizer.push();

      expect(result).toEqual({ pushedCount: 1, failedCount: 1 });
      expect(mockQueueManager.markAsProcessed).toHaveBeenCalledTimes(1);
      expect(mockQueueManager.incrementRetry).toHaveBeenCalledTimes(1);
      expect(mockQueueManager.incrementRetry).toHaveBeenCalledWith('item_2', 'Validation error');
    });

    it('should process items in batches', async () => {
      // Create 120 items (should be split into 3 batches of 50 each)
      const pendingItems: SyncQueueItem[] = [];
      for (let i = 1; i <= 120; i++) {
        pendingItems.push({
          id: `item_${i}`,
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: `post_${i}`,
          payload: { title: `Post ${i}` },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        mockRecords.set(`post_${i}`, { id: `post_${i}`, serverId: null });
      }

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);

      // Mock API to return success for all items
      mockApiClient.push.mockImplementation((payload: any) => {
        const results = payload.changes.map(() => ({
          serverId: 'server_id',
          serverUpdatedAt: Date.now(),
        }));
        return Promise.resolve({ success: true, results });
      });

      const result = await pushSynchronizer.push();

      expect(result).toEqual({ pushedCount: 120, failedCount: 0 });
      expect(mockApiClient.push).toHaveBeenCalledTimes(3); // 3 batches
      expect(mockQueueManager.markAsProcessed).toHaveBeenCalledTimes(120);
    });

    it('should handle complete batch failure', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);
      mockApiClient.push.mockRejectedValue(new Error('Network error'));

      const result = await pushSynchronizer.push();

      expect(result).toEqual({ pushedCount: 0, failedCount: 1 });
      expect(mockQueueManager.incrementRetry).toHaveBeenCalledWith('item_1', 'Network error');
      expect(mockQueueManager.markAsProcessed).not.toHaveBeenCalled();
    });

    it('should handle API returning success: false', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);
      mockApiClient.push.mockResolvedValue({ success: false, results: [] });

      const result = await pushSynchronizer.push();

      expect(result).toEqual({ pushedCount: 0, failedCount: 1 });
      expect(mockQueueManager.incrementRetry).toHaveBeenCalled();
    });
  });

  describe('updateLocalRecord', () => {
    it('should update local record with server data', async () => {
      const mockRecord = {
        id: 'post_1',
        serverId: null,
        serverUpdatedAt: null,
        syncStatus: 'pending',
        lastSyncError: 'Previous error',
      };

      mockRecords.set('post_1', mockRecord);

      // Call private method via push() workflow
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);

      const serverUpdatedAt = Date.now();
      mockApiClient.push.mockResolvedValue({
        success: true,
        results: [{ serverId: 'server_123', serverUpdatedAt }],
      });

      await pushSynchronizer.push();

      expect(mockRecord.serverId).toBe('server_123');
      expect(mockRecord.serverUpdatedAt).toBe(serverUpdatedAt);
      expect(mockRecord.syncStatus).toBe('synced');
      expect(mockRecord.lastSyncError).toBeNull();
    });

    it('should not throw if local record update fails', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);
      mockApiClient.push.mockResolvedValue({
        success: true,
        results: [{ serverId: 'server_1' }],
      });

      // Record not found
      mockCollection.find.mockRejectedValue(new Error('Not found'));

      // Should not throw, just mark as processed
      const result = await pushSynchronizer.push();

      expect(result).toEqual({ pushedCount: 1, failedCount: 0 });
      expect(mockQueueManager.markAsProcessed).toHaveBeenCalled();
    });
  });

  describe('payload formatting', () => {
    it('should format payload correctly for API', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1', content: 'Content' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'item_2',
          operation: SyncOperation.DELETE,
          tableName: 'comments',
          recordId: 'comment_1',
          payload: { deletedAt: Date.now() },
          retryCount: 1,
          errorMessage: 'Previous error',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);
      mockApiClient.push.mockResolvedValue({
        success: true,
        results: [{}, {}],
      });

      await pushSynchronizer.push();

      expect(mockApiClient.push).toHaveBeenCalledWith({
        changes: [
          {
            tableName: 'posts',
            operation: SyncOperation.CREATE,
            recordId: 'post_1',
            data: { title: 'Post 1', content: 'Content' },
          },
          {
            tableName: 'comments',
            operation: SyncOperation.DELETE,
            recordId: 'comment_1',
            data: { deletedAt: expect.any(Number) },
          },
        ],
      });
    });
  });

  describe('retry handling', () => {
    it('should increment retry count for failed items', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 2,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);
      mockApiClient.push.mockRejectedValue(new Error('Server timeout'));

      await pushSynchronizer.push();

      expect(mockQueueManager.incrementRetry).toHaveBeenCalledWith('item_1', 'Server timeout');
    });

    it('should handle incrementRetry failure gracefully', async () => {
      const pendingItems: SyncQueueItem[] = [
        {
          id: 'item_1',
          operation: SyncOperation.CREATE,
          tableName: 'posts',
          recordId: 'post_1',
          payload: { title: 'Post 1' },
          retryCount: 0,
          errorMessage: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockQueueManager.getPendingItems.mockResolvedValue(pendingItems);
      mockApiClient.push.mockRejectedValue(new Error('Network error'));
      mockQueueManager.incrementRetry.mockRejectedValue(new Error('DB error'));

      // Should not throw - error is logged but not counted as failed
      const result = await pushSynchronizer.push();

      // Even though incrementRetry failed, the push itself still returns 0 pushed
      // The implementation logs the error but doesn't prevent the function from continuing
      expect(result.pushedCount).toBe(0);
      expect(mockQueueManager.incrementRetry).toHaveBeenCalled();
    });
  });
});
