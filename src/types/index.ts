import { Database, Model, TableName } from '@nozbe/watermelondb';

/**
 * Sync operation types
 */
export enum SyncOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

/**
 * Sync status
 */
export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  ERROR = 'error',
}

/**
 * Conflict resolution strategies
 */
export enum ConflictStrategy {
  LAST_WRITE_WINS = 'last-write-wins',
  SERVER_WINS = 'server-wins',
  CLIENT_WINS = 'client-wins',
  CUSTOM = 'custom',
}

/**
 * Network connection status
 */
export type NetworkStatus = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
};

/**
 * Sync queue item from database
 */
export interface SyncQueueItem {
  id: string;
  operation: SyncOperation;
  tableName: string;
  recordId: string;
  payload: Record<string, any>;
  retryCount: number;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * API endpoint configuration
 */
export interface ApiEndpoints {
  push: string;
  pull: string;
}

/**
 * Push request payload
 */
export interface PushPayload {
  changes: {
    tableName: string;
    operation: SyncOperation;
    recordId: string;
    data: Record<string, any>;
  }[];
}

/**
 * Push response from server
 */
export interface PushResponse {
  success: boolean;
  results: {
    recordId: string;
    serverId?: string;
    serverUpdatedAt?: number;
    error?: string;
  }[];
}

/**
 * Pull request payload
 */
export interface PullPayload {
  lastSyncAt: number | null;
  tables: string[];
}

/**
 * Pull response from server
 */
export interface PullResponse {
  timestamp: number;
  changes: {
    [tableName: string]: {
      created: Record<string, any>[];
      updated: Record<string, any>[];
      deleted: string[];
    };
  };
}

/**
 * API client interface for making sync requests
 */
export interface ApiClient {
  push: (payload: PushPayload) => Promise<PushResponse>;
  pull: (payload: PullPayload) => Promise<PullResponse>;
}

/**
 * Conflict resolution context
 */
export interface ConflictContext {
  tableName: string;
  recordId: string;
  localData: Record<string, any>;
  serverData: Record<string, any>;
  localUpdatedAt: number;
  serverUpdatedAt: number;
}

/**
 * Conflict resolver function type
 */
export type ConflictResolverFn = (
  context: ConflictContext
) => 'local' | 'server' | Record<string, any>;

/**
 * Sync engine configuration
 */
export interface SyncEngineConfig {
  /** WatermelonDB database instance */
  database: Database;

  /** List of table names to sync */
  tables: TableName<Model>[];

  /** API client for making sync requests */
  apiClient: ApiClient;

  /** Conflict resolution strategy */
  conflictStrategy?: ConflictStrategy;

  /** Custom conflict resolver function (required if strategy is CUSTOM) */
  customConflictResolver?: ConflictResolverFn;

  /** Sync interval in milliseconds (default: 5 minutes) */
  syncInterval?: number;

  /** Maximum retry attempts for failed syncs (default: 3) */
  maxRetries?: number;

  /** Base delay for exponential backoff in milliseconds (default: 1000) */
  retryDelayBase?: number;

  /** Enable automatic background sync (default: true) */
  enableBackgroundSync?: boolean;

  /** Enable automatic sync on network reconnection (default: true) */
  syncOnReconnect?: boolean;

  /** Batch size for push operations (default: 50) */
  pushBatchSize?: number;

  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Sync engine state
 */
export interface SyncEngineState {
  status: SyncStatus;
  lastSyncAt: number | null;
  pendingChanges: number;
  error: Error | null;
  isSyncing: boolean;
}

/**
 * Sync statistics
 */
export interface SyncStats {
  pushedCount: number;
  pulledCount: number;
  failedCount: number;
  duration: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  stats: SyncStats;
  error?: Error;
}

/**
 * Listener callback types
 */
export type SyncStatusListener = (state: SyncEngineState) => void;
export type NetworkStatusListener = (status: NetworkStatus) => void;

/**
 * Base model with sync metadata
 */
export interface SyncMetadata {
  serverId?: string | null;
  serverUpdatedAt?: number | null;
  offlineSyncStatus?: 'pending' | 'synced' | 'failed' | null;
  lastSyncError?: string | null;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay?: number;
}

/**
 * Exponential backoff calculator
 */
export interface BackoffCalculator {
  (attempt: number, config: RetryConfig): number;
}
