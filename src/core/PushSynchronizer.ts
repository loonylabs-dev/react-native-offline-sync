import { Database, Model } from '@nozbe/watermelondb';
import { SyncQueueManager } from './SyncQueueManager';
import { ApiClient, PushPayload, SyncQueueItem } from '../types';
import { createLogger } from '../utils';

/**
 * Push synchronizer
 * Handles pushing local changes to the server
 */
export class PushSynchronizer {
  private database: Database;
  private queueManager: SyncQueueManager;
  private apiClient: ApiClient;
  private maxRetries: number;
  private batchSize: number;
  private logger = createLogger('[PushSynchronizer]', false);

  constructor(
    database: Database,
    queueManager: SyncQueueManager,
    apiClient: ApiClient,
    maxRetries: number = 3,
    batchSize: number = 50,
    debug: boolean = false
  ) {
    this.database = database;
    this.queueManager = queueManager;
    this.apiClient = apiClient;
    this.maxRetries = maxRetries;
    this.batchSize = batchSize;
    this.logger.setDebug(debug);
  }

  /**
   * Push all pending changes to server
   */
  async push(): Promise<{ pushedCount: number; failedCount: number }> {
    try {
      this.logger.log('Starting push synchronization...');

      // Get pending items from queue
      const pendingItems = await this.queueManager.getPendingItems(this.maxRetries);

      if (pendingItems.length === 0) {
        this.logger.log('No pending items to push');
        return { pushedCount: 0, failedCount: 0 };
      }

      this.logger.log(`Found ${pendingItems.length} items to push`);

      // Process in batches
      let pushedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < pendingItems.length; i += this.batchSize) {
        const batch = pendingItems.slice(i, i + this.batchSize);
        const result = await this.pushBatch(batch);
        pushedCount += result.pushedCount;
        failedCount += result.failedCount;
      }

      this.logger.log(`Push completed: ${pushedCount} pushed, ${failedCount} failed`);

      return { pushedCount, failedCount };
    } catch (error) {
      this.logger.error('Push synchronization failed:', error);
      throw error;
    }
  }

  /**
   * Push a batch of items
   */
  private async pushBatch(
    items: SyncQueueItem[]
  ): Promise<{ pushedCount: number; failedCount: number }> {
    try {
      // Prepare payload
      const payload: PushPayload = {
        changes: items.map((item) => ({
          tableName: item.tableName,
          operation: item.operation,
          recordId: item.recordId,
          data: item.payload,
        })),
      };

      // Send to server
      this.logger.log(`Pushing batch of ${items.length} items...`);
      const response = await this.apiClient.push(payload);

      if (!response.success) {
        throw new Error('Push request failed');
      }

      // Process results
      let pushedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const result = response.results[i];

        if (result.error) {
          // Item failed - increment retry count
          await this.queueManager.incrementRetry(item.id, result.error);
          failedCount++;
          this.logger.warn(`Item ${item.id} failed: ${result.error}`);
        } else {
          // Item succeeded - update local record and remove from queue
          await this.updateLocalRecord(
            item.tableName,
            item.recordId,
            result.serverId,
            result.serverUpdatedAt
          );
          await this.queueManager.markAsProcessed(item.id);
          pushedCount++;
          this.logger.log(`Item ${item.id} pushed successfully`);
        }
      }

      return { pushedCount, failedCount };
    } catch (error) {
      this.logger.error('Batch push failed:', error);

      // Increment retry count for all items in batch
      let failedCount = 0;
      for (const item of items) {
        try {
          await this.queueManager.incrementRetry(
            item.id,
            error instanceof Error ? error.message : 'Unknown error'
          );
          failedCount++;
        } catch (retryError) {
          this.logger.error(`Failed to increment retry for item ${item.id}:`, retryError);
        }
      }

      return { pushedCount: 0, failedCount };
    }
  }

  /**
   * Update local record with server response
   */
  private async updateLocalRecord(
    tableName: string,
    recordId: string,
    serverId?: string,
    serverUpdatedAt?: number
  ): Promise<void> {
    try {
      await this.database.write(async () => {
        const collection = this.database.get<Model>(tableName);
        const record = await collection.find(recordId);

        await record.update((rec: any) => {
          if (serverId) {
            rec.serverId = serverId;
          }
          if (serverUpdatedAt) {
            rec.serverUpdatedAt = serverUpdatedAt;
          }
          rec.syncStatus = 'synced';
          rec.lastSyncError = null;
        });
      });

      this.logger.log(`Updated local record ${tableName}:${recordId}`);
    } catch (error) {
      this.logger.error(`Failed to update local record ${tableName}:${recordId}:`, error);
      // Don't throw - we already removed from queue
    }
  }
}
