import { Database, Model, Q, TableName } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient, PullPayload, ConflictContext } from '../types';
import { IConflictResolver } from '../strategies/ConflictResolver';
import { createLogger } from '../utils';

const LAST_SYNC_KEY = '@offlineSync:lastSyncAt';

/**
 * Pull synchronizer
 * Handles pulling changes from server and applying them locally
 */
export class PullSynchronizer {
  private database: Database;
  private apiClient: ApiClient;
  private tables: TableName<Model>[];
  private conflictResolver: IConflictResolver;
  private logger = createLogger('[PullSynchronizer]', false);

  constructor(
    database: Database,
    apiClient: ApiClient,
    tables: TableName<Model>[],
    conflictResolver: IConflictResolver,
    debug: boolean = false
  ) {
    this.database = database;
    this.apiClient = apiClient;
    this.tables = tables;
    this.conflictResolver = conflictResolver;
    this.logger.setDebug(debug);
  }

  /**
   * Pull changes from server
   */
  async pull(): Promise<{ pulledCount: number }> {
    try {
      this.logger.log('Starting pull synchronization...');

      // Get last sync timestamp
      const lastSyncAt = await this.getLastSyncTimestamp();
      this.logger.log(`Last sync at: ${lastSyncAt ? new Date(lastSyncAt) : 'never'}`);

      // Prepare pull request
      const payload: PullPayload = {
        lastSyncAt,
        tables: this.tables as string[],
      };

      // Fetch changes from server
      const response = await this.apiClient.pull(payload);
      this.logger.log(`Received changes for ${Object.keys(response.changes).length} tables`);

      // Apply changes locally
      let pulledCount = 0;

      await this.database.write(async () => {
        for (const [tableName, changes] of Object.entries(response.changes)) {
          const created = await this.applyCreated(tableName, changes.created);
          const updated = await this.applyUpdated(tableName, changes.updated);
          const deleted = await this.applyDeleted(tableName, changes.deleted);

          pulledCount += created + updated + deleted;
          this.logger.log(
            `Table ${tableName}: ${created} created, ${updated} updated, ${deleted} deleted`
          );
        }
      });

      // Update last sync timestamp
      await this.setLastSyncTimestamp(response.timestamp);

      this.logger.log(`Pull completed: ${pulledCount} records synced`);

      return { pulledCount };
    } catch (error) {
      this.logger.error('Pull synchronization failed:', error);
      throw error;
    }
  }

  /**
   * Apply created records from server
   */
  private async applyCreated(tableName: string, records: Record<string, any>[]): Promise<number> {
    if (records.length === 0) return 0;

    const collection = this.database.get<Model>(tableName);

    for (const serverData of records) {
      try {
        // Check if record already exists locally
        const existing = await collection
          .query(Q.where('server_id', serverData.id))
          .fetch();

        if (existing.length > 0) {
          // Record exists - treat as update
          await this.updateRecord(existing[0], serverData);
        } else {
          // Create new record
          await collection.create((record: any) => {
            this.applyServerData(record, serverData);
          });
        }
      } catch (error) {
        this.logger.error(`Failed to create record in ${tableName}:`, error);
      }
    }

    return records.length;
  }

  /**
   * Apply updated records from server
   */
  private async applyUpdated(tableName: string, records: Record<string, any>[]): Promise<number> {
    if (records.length === 0) return 0;

    const collection = this.database.get<Model>(tableName);
    let updatedCount = 0;

    for (const serverData of records) {
      try {
        // Find local record by server ID
        const localRecords = await collection
          .query(Q.where('server_id', serverData.id))
          .fetch();

        if (localRecords.length > 0) {
          await this.updateRecord(localRecords[0], serverData);
          updatedCount++;
        } else {
          // Record doesn't exist locally - create it
          await collection.create((record: any) => {
            this.applyServerData(record, serverData);
          });
          updatedCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to update record in ${tableName}:`, error);
      }
    }

    return updatedCount;
  }

  /**
   * Apply deleted records from server
   */
  private async applyDeleted(tableName: string, recordIds: string[]): Promise<number> {
    if (recordIds.length === 0) return 0;

    const collection = this.database.get<Model>(tableName);
    let deletedCount = 0;

    for (const serverId of recordIds) {
      try {
        const records = await collection.query(Q.where('server_id', serverId)).fetch();

        for (const record of records) {
          await record.markAsDeleted();
          deletedCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to delete record in ${tableName}:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Update a local record with conflict resolution
   */
  private async updateRecord(localRecord: Model, serverData: Record<string, any>): Promise<void> {
    const localData = localRecord._raw as any;

    // Check for conflict
    const hasConflict =
      localData.sync_status === 'pending' &&
      localData.server_updated_at &&
      serverData.updated_at > localData.server_updated_at;

    if (hasConflict) {
      this.logger.log(`Conflict detected for record ${localRecord.id}`);

      // Resolve conflict
      const context: ConflictContext = {
        tableName: localRecord.table,
        recordId: localRecord.id,
        localData: localData,
        serverData: serverData,
        localUpdatedAt: localData.updated_at || 0,
        serverUpdatedAt: serverData.updated_at || 0,
      };

      const resolution = this.conflictResolver.resolve(context);

      if (resolution === 'local') {
        // Keep local changes
        this.logger.log(`Keeping local changes for ${localRecord.id}`);
        return;
      } else if (resolution === 'server') {
        // Apply server changes
        this.logger.log(`Applying server changes for ${localRecord.id}`);
        await localRecord.update((record: any) => {
          this.applyServerData(record, serverData);
        });
      } else {
        // Custom resolution - apply merged data
        this.logger.log(`Applying custom resolution for ${localRecord.id}`);
        await localRecord.update((record: any) => {
          this.applyServerData(record, resolution);
        });
      }
    } else {
      // No conflict - apply server data
      await localRecord.update((record: any) => {
        this.applyServerData(record, serverData);
      });
    }
  }

  /**
   * Apply server data to a record
   */
  private applyServerData(record: any, serverData: Record<string, any>): void {
    // Apply all server fields except metadata
    Object.keys(serverData).forEach((key) => {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') {
        return; // Skip these fields
      }

      // Convert camelCase to snake_case for WatermelonDB
      const fieldName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      record[fieldName] = serverData[key];
    });

    // Update sync metadata
    record.serverId = serverData.id;
    record.serverUpdatedAt = serverData.updated_at || Date.now();
    record.syncStatus = 'synced';
    record.lastSyncError = null;
  }

  /**
   * Get last sync timestamp from storage
   */
  private async getLastSyncTimestamp(): Promise<number | null> {
    try {
      const value = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return value ? parseInt(value, 10) : null;
    } catch (error) {
      this.logger.error('Failed to get last sync timestamp:', error);
      return null;
    }
  }

  /**
   * Save last sync timestamp to storage
   */
  private async setLastSyncTimestamp(timestamp: number): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp.toString());
    } catch (error) {
      this.logger.error('Failed to set last sync timestamp:', error);
    }
  }
}
