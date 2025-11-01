import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import { SyncMetadata } from '../../types';

/**
 * Base model with sync metadata fields
 * Extend this class for models that need offline sync support
 *
 * @example
 * ```typescript
 * import { BaseModel } from '@loonylabs/react-native-offline-sync';
 * import { text, readonly, date } from '@nozbe/watermelondb/decorators';
 *
 * class User extends BaseModel {
 *   static table = 'users';
 *
 *   @text('name') name!: string;
 *   @text('email') email!: string;
 *   @readonly @date('created_at') createdAt!: Date;
 * }
 * ```
 */
export class BaseModel extends Model implements SyncMetadata {
  @field('server_id') serverId?: string | null;
  @field('server_updated_at') serverUpdatedAt?: number | null;
  @field('sync_status') offlineSyncStatus?: 'pending' | 'synced' | 'failed' | null;
  @field('last_sync_error') lastSyncError?: string | null;

  /**
   * Check if this record has been synced to the server
   */
  get isSynced(): boolean {
    return this.offlineSyncStatus === 'synced' && !!this.serverId;
  }

  /**
   * Check if this record has a sync error
   */
  get hasSyncError(): boolean {
    return this.offlineSyncStatus === 'failed';
  }

  /**
   * Check if this record is pending sync
   */
  get isPendingSync(): boolean {
    return this.offlineSyncStatus === 'pending';
  }
}
