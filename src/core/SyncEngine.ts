import { SyncQueueManager } from './SyncQueueManager';
import { PushSynchronizer } from './PushSynchronizer';
import { PullSynchronizer } from './PullSynchronizer';
import { NetworkDetector } from './NetworkDetector';
import { createConflictResolver } from '../strategies/ConflictResolver';
import {
  SyncEngineConfig,
  SyncEngineState,
  SyncResult,
  SyncStats,
  SyncStatus,
  SyncStatusListener,
  ConflictStrategy,
  SyncOperation,
} from '../types';
import { createLogger, now } from '../utils';

/**
 * Main sync engine orchestrator
 * Coordinates all sync operations and manages state
 */
export class SyncEngine {
  private queueManager: SyncQueueManager;
  private pushSynchronizer: PushSynchronizer;
  private pullSynchronizer: PullSynchronizer;
  private networkDetector: NetworkDetector;
  private config: Required<SyncEngineConfig>;
  private state: SyncEngineState;
  private listeners: Set<SyncStatusListener> = new Set();
  private syncIntervalId?: ReturnType<typeof setInterval>;
  private logger = createLogger('[SyncEngine]', false);
  private isInitialized = false;

  constructor(config: SyncEngineConfig) {
    // Apply defaults
    this.config = {
      ...config,
      conflictStrategy: config.conflictStrategy ?? ConflictStrategy.LAST_WRITE_WINS,
      syncInterval: config.syncInterval ?? 5 * 60 * 1000, // 5 minutes
      maxRetries: config.maxRetries ?? 3,
      retryDelayBase: config.retryDelayBase ?? 1000,
      enableBackgroundSync: config.enableBackgroundSync ?? true,
      syncOnReconnect: config.syncOnReconnect ?? true,
      pushBatchSize: config.pushBatchSize ?? 50,
      debug: config.debug ?? false,
      customConflictResolver: config.customConflictResolver || undefined,
    } as Required<SyncEngineConfig>;

    this.logger.setDebug(this.config.debug);

    // Initialize state
    this.state = {
      status: SyncStatus.IDLE,
      lastSyncAt: null,
      pendingChanges: 0,
      error: null,
      isSyncing: false,
    };

    // Initialize components
    this.queueManager = new SyncQueueManager(config.database, this.config.debug);

    this.pushSynchronizer = new PushSynchronizer(
      config.database,
      this.queueManager,
      config.apiClient,
      this.config.maxRetries,
      this.config.pushBatchSize,
      this.config.debug
    );

    const conflictResolver = createConflictResolver(
      this.config.conflictStrategy,
      this.config.customConflictResolver
    );

    this.pullSynchronizer = new PullSynchronizer(
      config.database,
      config.apiClient,
      config.tables,
      conflictResolver,
      this.config.debug
    );

    this.networkDetector = new NetworkDetector(this.config.debug);

    this.logger.log('SyncEngine created');
  }

  /**
   * Initialize the sync engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('SyncEngine already initialized');
      return;
    }

    try {
      this.logger.log('Initializing SyncEngine...');

      // Initialize network detector
      await this.networkDetector.initialize();

      // Setup network status listener
      if (this.config.syncOnReconnect) {
        this.networkDetector.addListener((status) => {
          if (status.isConnected && !this.state.isSyncing) {
            this.logger.log('Network reconnected - triggering sync');
            this.sync().catch((error) => {
              this.logger.error('Auto-sync on reconnect failed:', error);
            });
          }
        });
      }

      // Update pending changes count (best effort - database might not be fully ready yet)
      try {
        await this.updatePendingCount();
      } catch (error) {
        this.logger.warn('Could not update pending count during initialization:', error);
        // This is non-critical - count will be updated on first sync
      }

      // Start background sync
      if (this.config.enableBackgroundSync) {
        this.startBackgroundSync();
      }

      this.isInitialized = true;
      this.logger.log('SyncEngine initialized');
    } catch (error) {
      this.logger.error('Failed to initialize SyncEngine:', error);
      throw error;
    }
  }

  /**
   * Destroy the sync engine
   */
  destroy(): void {
    this.logger.log('Destroying SyncEngine...');

    // Stop background sync
    this.stopBackgroundSync();

    // Cleanup network detector
    this.networkDetector.destroy();

    // Clear listeners
    this.listeners.clear();

    this.isInitialized = false;
    this.logger.log('SyncEngine destroyed');
  }

  /**
   * Perform full sync (push + pull)
   */
  async sync(): Promise<SyncResult> {
    const startTime = now();

    try {
      // Check if already syncing
      if (this.state.isSyncing) {
        this.logger.warn('Sync already in progress');
        throw new Error('Sync already in progress');
      }

      // Check network connectivity
      if (!this.networkDetector.isOnline()) {
        this.logger.warn('Cannot sync - device is offline');
        throw new Error('Device is offline');
      }

      // Update state
      this.updateState({
        status: SyncStatus.SYNCING,
        isSyncing: true,
        error: null,
      });

      this.logger.log('Starting full sync...');

      // Push local changes
      const pushResult = await this.pushSynchronizer.push();
      this.logger.log(`Push: ${pushResult.pushedCount} pushed, ${pushResult.failedCount} failed`);

      // Pull server changes
      const pullResult = await this.pullSynchronizer.pull();
      this.logger.log(`Pull: ${pullResult.pulledCount} pulled`);

      // Update pending count
      await this.updatePendingCount();

      // Calculate stats
      const stats: SyncStats = {
        pushedCount: pushResult.pushedCount,
        pulledCount: pullResult.pulledCount,
        failedCount: pushResult.failedCount,
        duration: now() - startTime,
      };

      // Update state
      this.updateState({
        status: SyncStatus.IDLE,
        lastSyncAt: now(),
        isSyncing: false,
        error: null,
      });

      this.logger.log(`Full sync completed in ${stats.duration}ms`);

      return {
        success: true,
        stats,
      };
    } catch (error) {
      this.logger.error('Sync failed:', error);

      // Update state
      this.updateState({
        status: SyncStatus.ERROR,
        isSyncing: false,
        error: error as Error,
      });

      return {
        success: false,
        stats: {
          pushedCount: 0,
          pulledCount: 0,
          failedCount: 0,
          duration: now() - startTime,
        },
        error: error as Error,
      };
    }
  }

  /**
   * Add an operation to the sync queue
   */
  async queueOperation(
    operation: SyncOperation,
    tableName: string,
    recordId: string,
    payload: Record<string, any>
  ): Promise<void> {
    await this.queueManager.addToQueue(operation, tableName, recordId, payload);
    await this.updatePendingCount();
  }

  /**
   * Get current sync state
   */
  getState(): SyncEngineState {
    return { ...this.state };
  }

  /**
   * Get network detector instance
   * Useful for hooks like useNetworkStatus
   */
  getNetworkDetector(): NetworkDetector {
    return this.networkDetector;
  }

  /**
   * Add a state listener
   */
  addListener(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    this.logger.log('Added sync status listener');

    // Return unsubscribe function
    return () => {
      this.removeListener(listener);
    };
  }

  /**
   * Remove a state listener
   */
  removeListener(listener: SyncStatusListener): void {
    this.listeners.delete(listener);
    this.logger.log('Removed sync status listener');
  }

  /**
   * Start background sync
   */
  private startBackgroundSync(): void {
    if (this.syncIntervalId) {
      return;
    }

    this.logger.log(`Starting background sync (interval: ${this.config.syncInterval}ms)`);

    this.syncIntervalId = setInterval(() => {
      if (this.networkDetector.isOnline() && !this.state.isSyncing) {
        this.logger.log('Background sync triggered');
        this.sync().catch((error) => {
          this.logger.error('Background sync failed:', error);
        });
      }
    }, this.config.syncInterval);
  }

  /**
   * Stop background sync
   */
  private stopBackgroundSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
      this.logger.log('Stopped background sync');
    }
  }

  /**
   * Update pending changes count
   */
  private async updatePendingCount(): Promise<void> {
    const count = await this.queueManager.getPendingCount();
    this.state.pendingChanges = count;
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<SyncEngineState>): void {
    this.state = {
      ...this.state,
      ...updates,
    };

    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (error) {
        this.logger.error('Error in sync status listener:', error);
      }
    });
  }
}
