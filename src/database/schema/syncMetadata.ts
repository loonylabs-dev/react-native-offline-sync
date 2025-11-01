import { ColumnSchema } from '@nozbe/watermelondb';

/**
 * Sync metadata columns that can be added to any table
 * These columns help track sync status and server state
 */
export const syncMetadataColumns: ColumnSchema[] = [
  { name: 'server_id', type: 'string', isOptional: true },
  { name: 'server_updated_at', type: 'number', isOptional: true },
  { name: 'sync_status', type: 'string', isOptional: true }, // pending, synced, failed
  { name: 'last_sync_error', type: 'string', isOptional: true },
];

/**
 * Helper function to create a table schema with sync metadata
 *
 * @example
 * ```typescript
 * import { createTableSchemaWithSync } from '@loonylabs/react-native-offline-sync';
 *
 * const userSchema = createTableSchemaWithSync('users', [
 *   { name: 'name', type: 'string' },
 *   { name: 'email', type: 'string' },
 * ]);
 * ```
 */
export const createTableSchemaWithSync = (
  tableName: string,
  columns: ColumnSchema[]
): { name: string; columns: ColumnSchema[] } => {
  return {
    name: tableName,
    columns: [...columns, ...syncMetadataColumns],
  };
};
