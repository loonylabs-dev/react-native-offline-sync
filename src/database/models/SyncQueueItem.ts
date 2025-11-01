import { Model } from '@nozbe/watermelondb';
import { field, readonly, date, json } from '@nozbe/watermelondb/decorators';
import { SyncOperation } from '../../types';

/**
 * Sync Queue Item model
 * Represents a pending sync operation in the queue
 */
export class SyncQueueItemModel extends Model {
  static table = 'sync_queue';

  @field('operation') operation!: SyncOperation;
  @field('table_name') tableName!: string;
  @field('record_id') recordId!: string;
  @json('payload', (json) => json) payload!: Record<string, any>;
  @field('retry_count') retryCount!: number;
  @field('error_message') errorMessage?: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  /**
   * Check if this item has exceeded max retries
   */
  hasExceededMaxRetries(maxRetries: number): boolean {
    return this.retryCount >= maxRetries;
  }

  /**
   * Check if this item has failed
   */
  get hasFailed(): boolean {
    return !!this.errorMessage;
  }
}
