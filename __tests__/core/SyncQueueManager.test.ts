import { Database } from '@nozbe/watermelondb';
import { SyncQueueManager } from '../../src/core/SyncQueueManager';
import { SyncOperation } from '../../src/types';

// Mock WatermelonDB
jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn((field: string, comparator: any) => ({
      field,
      comparator,
    })),
    lt: jest.fn((value: number) => ({ type: 'lt', value })),
    gte: jest.fn((value: number) => ({ type: 'gte', value })),
  },
}));

describe('SyncQueueManager', () => {
  let queueManager: SyncQueueManager;
  let mockDatabase: jest.Mocked<Database>;
  let mockCollection: any;
  let mockItems: any[];

  beforeEach(() => {
    // Reset mock items
    mockItems = [];

    // Mock collection methods
    mockCollection = {
      create: jest.fn((callback) => {
        const mockItem: any = {
          id: `item_${mockItems.length + 1}`,
          operation: null as any,
          tableName: '',
          recordId: '',
          payload: {},
          retryCount: 0,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        callback(mockItem);
        mockItems.push(mockItem);

        return Promise.resolve(mockItem);
      }),
      query: jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve(mockItems)),
        fetchCount: jest.fn(() => Promise.resolve(mockItems.length)),
      })),
      find: jest.fn((id: string) => {
        const item = mockItems.find((i) => i.id === id);
        if (!item) throw new Error('Not found');
        return Promise.resolve({
          ...item,
          update: jest.fn((callback) => {
            callback(item);
            return Promise.resolve();
          }),
          markAsDeleted: jest.fn(() => {
            mockItems = mockItems.filter((i) => i.id !== id);
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

    queueManager = new SyncQueueManager(mockDatabase, false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addToQueue', () => {
    it('should add an item to the queue', async () => {
      await queueManager.addToQueue(
        SyncOperation.CREATE,
        'posts',
        'record_123',
        { title: 'Test Post' }
      );

      expect(mockDatabase.write).toHaveBeenCalled();
      expect(mockCollection.create).toHaveBeenCalled();
      expect(mockItems).toHaveLength(1);
      expect(mockItems[0].operation).toBe(SyncOperation.CREATE);
      expect(mockItems[0].tableName).toBe('posts');
      expect(mockItems[0].recordId).toBe('record_123');
      expect(mockItems[0].payload).toEqual({ title: 'Test Post' });
      expect(mockItems[0].retryCount).toBe(0);
    });

    it('should add multiple items to the queue', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', { title: 'Post 1' });
      await queueManager.addToQueue(SyncOperation.UPDATE, 'posts', '2', { title: 'Post 2' });
      await queueManager.addToQueue(SyncOperation.DELETE, 'posts', '3', {});

      expect(mockItems).toHaveLength(3);
      expect(mockItems[0].operation).toBe(SyncOperation.CREATE);
      expect(mockItems[1].operation).toBe(SyncOperation.UPDATE);
      expect(mockItems[2].operation).toBe(SyncOperation.DELETE);
    });

    it('should throw error if database write fails', async () => {
      mockDatabase.write = jest.fn(() => Promise.reject(new Error('DB Error')));

      await expect(
        queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {})
      ).rejects.toThrow('DB Error');
    });
  });

  describe('getQueuedItems', () => {
    it('should return all queued items', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', { title: 'Post 1' });
      await queueManager.addToQueue(SyncOperation.UPDATE, 'posts', '2', { title: 'Post 2' });

      const items = await queueManager.getQueuedItems();

      expect(items).toHaveLength(2);
      expect(items[0].operation).toBe(SyncOperation.CREATE);
      expect(items[1].operation).toBe(SyncOperation.UPDATE);
    });

    it('should return empty array when queue is empty', async () => {
      const items = await queueManager.getQueuedItems();

      expect(items).toHaveLength(0);
    });

    it('should throw error if database query fails', async () => {
      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.reject(new Error('Query Error'))),
      }));

      await expect(queueManager.getQueuedItems()).rejects.toThrow('Query Error');
    });
  });

  describe('getPendingItems', () => {
    it('should return items with retry count below max retries', async () => {
      // Add items with different retry counts
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '2', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '3', {});

      // Manually set retry counts
      mockItems[0].retryCount = 0;
      mockItems[1].retryCount = 2;
      mockItems[2].retryCount = 3; // Failed

      // Mock query to filter by retry count
      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => {
          const filtered = mockItems.filter((item) => item.retryCount < 3);
          return Promise.resolve(filtered);
        }),
      }));

      const items = await queueManager.getPendingItems(3);

      expect(items).toHaveLength(2);
    });

    it('should return empty array when all items exceeded max retries', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      mockItems[0].retryCount = 5;

      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([])),
      }));

      const items = await queueManager.getPendingItems(3);

      expect(items).toHaveLength(0);
    });
  });

  describe('getFailedItems', () => {
    it('should return items that exceeded max retries', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '2', {});

      // Set retry counts
      mockItems[0].retryCount = 2;
      mockItems[1].retryCount = 5; // Failed

      // Mock query to filter failed items
      mockCollection.query = jest.fn(() => ({
        fetch: jest.fn(() => {
          const filtered = mockItems.filter((item) => item.retryCount >= 3);
          return Promise.resolve(filtered);
        }),
      }));

      const items = await queueManager.getFailedItems(3);

      expect(items).toHaveLength(1);
      expect(items[0].retryCount).toBe(5);
    });
  });

  describe('getPendingCount', () => {
    it('should return count of pending items', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '2', {});

      const count = await queueManager.getPendingCount();

      expect(count).toBe(2);
    });

    it('should return 0 when queue is empty', async () => {
      const count = await queueManager.getPendingCount();

      expect(count).toBe(0);
    });

    it('should return 0 if error occurs', async () => {
      mockCollection.query = jest.fn(() => ({
        fetchCount: jest.fn(() => Promise.reject(new Error('Count Error'))),
      }));

      const count = await queueManager.getPendingCount();

      expect(count).toBe(0);
    });
  });

  describe('markAsProcessed', () => {
    it('should remove item from queue', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      const itemId = mockItems[0].id;

      await queueManager.markAsProcessed(itemId);

      expect(mockItems).toHaveLength(0);
    });

    it('should throw error if item not found', async () => {
      await expect(queueManager.markAsProcessed('non_existent_id')).rejects.toThrow(
        'Not found'
      );
    });
  });

  describe('incrementRetry', () => {
    it('should increment retry count and update error message', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      const itemId = mockItems[0].id;

      expect(mockItems[0].retryCount).toBe(0);

      await queueManager.incrementRetry(itemId, 'Network error');

      expect(mockItems[0].retryCount).toBe(1);
      expect(mockItems[0].errorMessage).toBe('Network error');
    });

    it('should increment retry count multiple times', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      const itemId = mockItems[0].id;

      await queueManager.incrementRetry(itemId, 'Error 1');
      await queueManager.incrementRetry(itemId, 'Error 2');
      await queueManager.incrementRetry(itemId, 'Error 3');

      expect(mockItems[0].retryCount).toBe(3);
      expect(mockItems[0].errorMessage).toBe('Error 3');
    });

    it('should throw error if item not found', async () => {
      await expect(
        queueManager.incrementRetry('non_existent_id', 'Error')
      ).rejects.toThrow('Not found');
    });
  });

  describe('clearFailedItems', () => {
    it('should clear all failed items', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '2', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '3', {});

      // Set retry counts
      mockItems[0].retryCount = 1; // Pending
      mockItems[1].retryCount = 5; // Failed
      mockItems[2].retryCount = 4; // Failed

      // Mock getFailedItems to return items with retry >= 3
      jest.spyOn(queueManager as any, 'getFailedItems').mockResolvedValue([
        {
          id: mockItems[1].id,
          operation: mockItems[1].operation,
          tableName: mockItems[1].tableName,
          recordId: mockItems[1].recordId,
          payload: mockItems[1].payload,
          retryCount: mockItems[1].retryCount,
          errorMessage: mockItems[1].errorMessage,
          createdAt: mockItems[1].createdAt.getTime(),
          updatedAt: mockItems[1].updatedAt.getTime(),
        },
        {
          id: mockItems[2].id,
          operation: mockItems[2].operation,
          tableName: mockItems[2].tableName,
          recordId: mockItems[2].recordId,
          payload: mockItems[2].payload,
          retryCount: mockItems[2].retryCount,
          errorMessage: mockItems[2].errorMessage,
          createdAt: mockItems[2].createdAt.getTime(),
          updatedAt: mockItems[2].updatedAt.getTime(),
        },
      ]);

      const clearedCount = await queueManager.clearFailedItems(3);

      expect(clearedCount).toBe(2);
      expect(mockItems).toHaveLength(1);
      expect(mockItems[0].retryCount).toBe(1);
    });

    it('should return 0 if no failed items', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      mockItems[0].retryCount = 1;

      // Mock getFailedItems to return empty array
      jest.spyOn(queueManager as any, 'getFailedItems').mockResolvedValue([]);

      const clearedCount = await queueManager.clearFailedItems(3);

      expect(clearedCount).toBe(0);
      expect(mockItems).toHaveLength(1);
    });
  });

  describe('clearAllItems', () => {
    it('should clear all items from queue', async () => {
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      await queueManager.addToQueue(SyncOperation.UPDATE, 'posts', '2', {});
      await queueManager.addToQueue(SyncOperation.DELETE, 'posts', '3', {});

      expect(mockItems).toHaveLength(3);

      const clearedCount = await queueManager.clearAllItems();

      expect(clearedCount).toBe(3);
      expect(mockItems).toHaveLength(0);
    });

    it('should return 0 if queue is already empty', async () => {
      const clearedCount = await queueManager.clearAllItems();

      expect(clearedCount).toBe(0);
    });
  });

  describe('data persistence', () => {
    it('should persist operations with correct structure', async () => {
      const payload = {
        title: 'Test Post',
        content: 'Lorem ipsum',
        tags: ['test', 'demo'],
      };

      await queueManager.addToQueue(SyncOperation.UPDATE, 'posts', 'abc-123', payload);

      const items = await queueManager.getQueuedItems();

      expect(items[0]).toMatchObject({
        operation: SyncOperation.UPDATE,
        tableName: 'posts',
        recordId: 'abc-123',
        payload,
        retryCount: 0,
        errorMessage: null,
      });
    });

    it('should maintain queue across multiple operations', async () => {
      // Add items
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '1', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '2', {});
      await queueManager.addToQueue(SyncOperation.CREATE, 'posts', '3', {});

      // Process one
      const items = await queueManager.getQueuedItems();
      await queueManager.markAsProcessed(items[0].id);

      // Verify remaining
      const remaining = await queueManager.getQueuedItems();
      expect(remaining).toHaveLength(2);

      // Add more
      await queueManager.addToQueue(SyncOperation.UPDATE, 'posts', '4', {});

      const final = await queueManager.getQueuedItems();
      expect(final).toHaveLength(3);
    });
  });
});
