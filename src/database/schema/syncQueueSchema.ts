import { tableSchema } from '@nozbe/watermelondb';

/**
 * Sync Queue table schema
 * This table tracks all pending sync operations
 */
export const syncQueueTableSchema = tableSchema({
  name: 'sync_queue',
  columns: [
    { name: 'operation', type: 'string' }, // CREATE, UPDATE, DELETE
    { name: 'table_name', type: 'string' },
    { name: 'record_id', type: 'string' },
    { name: 'payload', type: 'string' }, // JSON stringified data
    { name: 'retry_count', type: 'number' },
    { name: 'error_message', type: 'string', isOptional: true },
    { name: 'created_at', type: 'number' },
    { name: 'updated_at', type: 'number' },
  ],
});

/**
 * Helper to get the complete sync queue schema configuration
 */
export const getSyncQueueSchema = () => syncQueueTableSchema;
