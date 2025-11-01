import { useState, useCallback } from 'react';
import { Database, Model } from '@nozbe/watermelondb';
import { SyncEngine } from '../core/SyncEngine';
import { SyncOperation } from '../types';

/**
 * Hook for optimistic UI updates
 * Performs local write first, then queues for sync
 *
 * @example
 * ```typescript
 * const { execute, isOptimistic } = useOptimisticUpdate(database, syncEngine);
 *
 * const createPost = async (data) => {
 *   return execute('posts', 'CREATE', async (collection) => {
 *     return await collection.create((post) => {
 *       post.title = data.title;
 *       post.content = data.content;
 *     });
 *   });
 * };
 * ```
 */
export function useOptimisticUpdate(database: Database, syncEngine: SyncEngine) {
  const [isOptimistic, setIsOptimistic] = useState(false);

  /**
   * Execute an optimistic update
   * 1. Writes to local DB immediately
   * 2. Queues for sync
   * 3. Returns the created/updated record
   */
  const execute = useCallback(
    async <T extends Model>(
      tableName: string,
      operation: SyncOperation,
      fn: (collection: any) => Promise<T>
    ): Promise<T> => {
      try {
        setIsOptimistic(true);

        // Perform local write
        const record = await database.write(async () => {
          const collection = database.get(tableName);
          return await fn(collection);
        });

        // Queue for sync
        const payload = (record as any)._raw;
        await syncEngine.queueOperation(operation, tableName, record.id, payload);

        // Trigger background sync (non-blocking)
        syncEngine.sync().catch((error) => {
          console.warn('Background sync after optimistic update failed:', error);
        });

        return record;
      } finally {
        setIsOptimistic(false);
      }
    },
    [database, syncEngine]
  );

  return {
    execute,
    isOptimistic,
  };
}
