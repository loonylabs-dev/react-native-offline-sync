import { Database, Q } from '@nozbe/watermelondb';
import { SyncQueueItemModel } from '../database/models/SyncQueueItem';
import { SyncOperation, SyncQueueItem } from '../types';
import { createLogger } from '../utils';

/**
 * Manages the sync queue operations
 * Handles adding, processing, and managing sync queue items
 */
export class SyncQueueManager {
  private database: Database;
  private logger = createLogger('[SyncQueueManager]', false);

  constructor(database: Database, debug: boolean = false) {
    this.database = database;
    this.logger.setDebug(debug);
  }

  /**
   * Add an operation to the sync queue
   */
  async addToQueue(
    operation: SyncOperation,
    tableName: string,
    recordId: string,
    payload: Record<string, any>
  ): Promise<void> {
    try {
      await this.database.write(async () => {
        const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
        await syncQueueCollection.create((item) => {
          item.operation = operation;
          item.tableName = tableName;
          item.recordId = recordId;
          item.payload = payload;
          item.retryCount = 0;
          item.errorMessage = null;
        });
      });

      this.logger.log(`Added ${operation} operation for ${tableName}:${recordId} to queue`);
    } catch (error) {
      this.logger.error('Failed to add to queue:', error);
      throw error;
    }
  }

  /**
   * Get all queued items (not yet processed)
   */
  async getQueuedItems(): Promise<SyncQueueItem[]> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
      const items = await syncQueueCollection.query().fetch();

      return items.map((item) => this.modelToQueueItem(item));
    } catch (error) {
      this.logger.error('Failed to get queued items:', error);
      throw error;
    }
  }

  /**
   * Get items that haven't exceeded max retries
   */
  async getPendingItems(maxRetries: number): Promise<SyncQueueItem[]> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
      const items = await syncQueueCollection
        .query(Q.where('retry_count', Q.lt(maxRetries)))
        .fetch();

      this.logger.log(`Found ${items.length} pending items`);
      return items.map((item) => this.modelToQueueItem(item));
    } catch (error) {
      this.logger.error('Failed to get pending items:', error);
      throw error;
    }
  }

  /**
   * Get failed items (exceeded max retries)
   */
  async getFailedItems(maxRetries: number): Promise<SyncQueueItem[]> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
      const items = await syncQueueCollection
        .query(Q.where('retry_count', Q.gte(maxRetries)))
        .fetch();

      this.logger.log(`Found ${items.length} failed items`);
      return items.map((item) => this.modelToQueueItem(item));
    } catch (error) {
      this.logger.error('Failed to get failed items:', error);
      throw error;
    }
  }

  /**
   * Get count of pending changes
   */
  async getPendingCount(): Promise<number> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
      const count = await syncQueueCollection.query().fetchCount();
      return count;
    } catch (error) {
      this.logger.error('Failed to get pending count:', error);
      return 0;
    }
  }

  /**
   * Mark an item as processed (remove from queue)
   */
  async markAsProcessed(itemId: string): Promise<void> {
    try {
      await this.database.write(async () => {
        const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
        const item = await syncQueueCollection.find(itemId);
        await item.markAsDeleted();
      });

      this.logger.log(`Marked item ${itemId} as processed`);
    } catch (error) {
      this.logger.error('Failed to mark as processed:', error);
      throw error;
    }
  }

  /**
   * Increment retry count and update error message
   */
  async incrementRetry(itemId: string, errorMessage: string): Promise<void> {
    try {
      await this.database.write(async () => {
        const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
        const item = await syncQueueCollection.find(itemId);
        await item.update((record) => {
          record.retryCount = record.retryCount + 1;
          record.errorMessage = errorMessage;
        });
      });

      this.logger.log(`Incremented retry count for item ${itemId}`);
    } catch (error) {
      this.logger.error('Failed to increment retry:', error);
      throw error;
    }
  }

  /**
   * Clear all failed items from the queue
   */
  async clearFailedItems(maxRetries: number): Promise<number> {
    try {
      const failedItems = await this.getFailedItems(maxRetries);

      await this.database.write(async () => {
        const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
        for (const item of failedItems) {
          const record = await syncQueueCollection.find(item.id);
          await record.markAsDeleted();
        }
      });

      this.logger.log(`Cleared ${failedItems.length} failed items`);
      return failedItems.length;
    } catch (error) {
      this.logger.error('Failed to clear failed items:', error);
      throw error;
    }
  }

  /**
   * Clear all items from the queue
   */
  async clearAllItems(): Promise<number> {
    try {
      const allItems = await this.getQueuedItems();

      await this.database.write(async () => {
        const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
        for (const item of allItems) {
          const record = await syncQueueCollection.find(item.id);
          await record.markAsDeleted();
        }
      });

      this.logger.log(`Cleared ${allItems.length} items from queue`);
      return allItems.length;
    } catch (error) {
      this.logger.error('Failed to clear all items:', error);
      throw error;
    }
  }

  /**
   * Convert model to queue item interface
   */
  private modelToQueueItem(model: SyncQueueItemModel): SyncQueueItem {
    return {
      id: model.id,
      operation: model.operation,
      tableName: model.tableName,
      recordId: model.recordId,
      payload: model.payload,
      retryCount: model.retryCount,
      errorMessage: model.errorMessage || null,
      createdAt: model.createdAt.getTime(),
      updatedAt: model.updatedAt.getTime(),
    };
  }
}
