import { Database } from '@nozbe/watermelondb';
import { SyncEngine } from '../../src/core/SyncEngine';
import { SyncQueueManager } from '../../src/core/SyncQueueManager';
import { PushSynchronizer } from '../../src/core/PushSynchronizer';
import { PullSynchronizer } from '../../src/core/PullSynchronizer';
import { NetworkDetector } from '../../src/core/NetworkDetector';
import { SyncStatus, SyncOperation, ConflictStrategy } from '../../src/types';

// Mock all dependencies
jest.mock('../../src/core/SyncQueueManager');
jest.mock('../../src/core/PushSynchronizer');
jest.mock('../../src/core/PullSynchronizer');
jest.mock('../../src/core/NetworkDetector');

describe('SyncEngine', () => {
  let syncEngine: SyncEngine;
  let mockDatabase: jest.Mocked<Database>;
  let mockApiClient: any;
  let mockQueueManager: jest.Mocked<SyncQueueManager>;
  let mockPushSynchronizer: jest.Mocked<PushSynchronizer>;
  let mockPullSynchronizer: jest.Mocked<PullSynchronizer>;
  let mockNetworkDetector: jest.Mocked<NetworkDetector>;

  beforeEach(() => {
    // Mock database
    mockDatabase = {
      write: jest.fn((callback) => callback()),
      get: jest.fn(),
    } as any;

    // Mock API client
    mockApiClient = {
      push: jest.fn().mockResolvedValue({
        success: true,
        results: [],
      }),
      pull: jest.fn().mockResolvedValue({
        timestamp: Date.now(),
        changes: {},
      }),
    };

    // Setup mocks
    mockQueueManager = {
      addToQueue: jest.fn().mockResolvedValue(undefined),
      getPendingCount: jest.fn().mockResolvedValue(0),
      getPendingItems: jest.fn().mockResolvedValue([]),
      removeFromQueue: jest.fn().mockResolvedValue(undefined),
      incrementRetry: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockPushSynchronizer = {
      push: jest.fn().mockResolvedValue({
        pushedCount: 2,
        failedCount: 0,
      }),
    } as any;

    mockPullSynchronizer = {
      pull: jest.fn().mockResolvedValue({
        pulledCount: 3,
      }),
    } as any;

    mockNetworkDetector = {
      initialize: jest.fn().mockResolvedValue(undefined),
      isOnline: jest.fn().mockReturnValue(true),
      getStatus: jest.fn().mockReturnValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      }),
      addListener: jest.fn().mockReturnValue(jest.fn()),
      destroy: jest.fn(),
    } as any;

    // Mock constructor implementations
    (SyncQueueManager as jest.Mock).mockImplementation(() => mockQueueManager);
    (PushSynchronizer as jest.Mock).mockImplementation(() => mockPushSynchronizer);
    (PullSynchronizer as jest.Mock).mockImplementation(() => mockPullSynchronizer);
    (NetworkDetector as jest.Mock).mockImplementation(() => mockNetworkDetector);

    syncEngine = new SyncEngine({
      database: mockDatabase,
      tables: ['posts', 'comments'],
      apiClient: mockApiClient,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config values', () => {
      const state = syncEngine.getState();

      expect(state.status).toBe(SyncStatus.IDLE);
      expect(state.lastSyncAt).toBeNull();
      expect(state.pendingChanges).toBe(0);
      expect(state.error).toBeNull();
      expect(state.isSyncing).toBe(false);
    });

    it('should apply custom config values', () => {
      const customEngine = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        conflictStrategy: ConflictStrategy.SERVER_WINS,
        syncInterval: 60000,
        maxRetries: 5,
        pushBatchSize: 100,
        debug: true,
      });

      expect(customEngine).toBeDefined();
    });

    it('should create all required components', () => {
      expect(SyncQueueManager).toHaveBeenCalledWith(mockDatabase, false);
      expect(PushSynchronizer).toHaveBeenCalled();
      expect(PullSynchronizer).toHaveBeenCalled();
      expect(NetworkDetector).toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await syncEngine.initialize();

      expect(mockNetworkDetector.initialize).toHaveBeenCalled();
      expect(mockQueueManager.getPendingCount).toHaveBeenCalled();
    });

    it('should not re-initialize if already initialized', async () => {
      await syncEngine.initialize();
      await syncEngine.initialize();

      expect(mockNetworkDetector.initialize).toHaveBeenCalledTimes(1);
    });

    it('should setup network listener when syncOnReconnect is enabled', async () => {
      const engineWithReconnect = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        syncOnReconnect: true,
      });

      await engineWithReconnect.initialize();

      expect(mockNetworkDetector.addListener).toHaveBeenCalled();
    });

    it('should throw error if initialization fails', async () => {
      mockNetworkDetector.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(syncEngine.initialize()).rejects.toThrow('Init failed');
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      await syncEngine.initialize();
    });

    it('should perform full sync successfully', async () => {
      const result = await syncEngine.sync();

      expect(result.success).toBe(true);
      expect(result.stats.pushedCount).toBe(2);
      expect(result.stats.pulledCount).toBe(3);
      expect(result.stats.failedCount).toBe(0);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
      expect(mockPushSynchronizer.push).toHaveBeenCalled();
      expect(mockPullSynchronizer.pull).toHaveBeenCalled();
    });

    it('should update state during sync', async () => {
      const states: any[] = [];
      syncEngine.addListener((state) => states.push({ ...state }));

      await syncEngine.sync();

      expect(states.length).toBeGreaterThan(0);
      expect(states.some((s) => s.status === SyncStatus.SYNCING)).toBe(true);
      expect(states.some((s) => s.status === SyncStatus.IDLE)).toBe(true);
    });

    it('should prevent concurrent sync operations', async () => {
      mockPushSynchronizer.push.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ pushedCount: 0, failedCount: 0 }), 100))
      );

      const promise1 = syncEngine.sync();
      const promise2 = syncEngine.sync();

      const results = await Promise.all([promise1, promise2]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.message).toBe('Sync already in progress');
    });

    it('should fail when device is offline', async () => {
      mockNetworkDetector.isOnline.mockReturnValue(false);

      const result = await syncEngine.sync();

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Device is offline');
      expect(mockPushSynchronizer.push).not.toHaveBeenCalled();
    });

    it('should handle push synchronizer errors', async () => {
      mockPushSynchronizer.push.mockRejectedValue(new Error('Push failed'));

      const result = await syncEngine.sync();

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Push failed');
      expect(syncEngine.getState().status).toBe(SyncStatus.ERROR);
    });

    it('should handle pull synchronizer errors', async () => {
      mockPullSynchronizer.pull.mockRejectedValue(new Error('Pull failed'));

      const result = await syncEngine.sync();

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Pull failed');
    });

    it('should update lastSyncAt on successful sync', async () => {
      const beforeSync = syncEngine.getState().lastSyncAt;
      await syncEngine.sync();
      const afterSync = syncEngine.getState().lastSyncAt;

      expect(beforeSync).toBeNull();
      expect(afterSync).toBeGreaterThan(0);
    });

    it('should update pending changes count after sync', async () => {
      mockQueueManager.getPendingCount.mockResolvedValue(5);

      await syncEngine.sync();

      expect(syncEngine.getState().pendingChanges).toBe(5);
    });
  });

  describe('queueOperation', () => {
    beforeEach(async () => {
      await syncEngine.initialize();
    });

    it('should add operation to queue', async () => {
      await syncEngine.queueOperation(SyncOperation.CREATE, 'posts', '123', { title: 'Test' });

      expect(mockQueueManager.addToQueue).toHaveBeenCalledWith(
        SyncOperation.CREATE,
        'posts',
        '123',
        { title: 'Test' }
      );
    });

    it('should update pending count after queuing', async () => {
      mockQueueManager.getPendingCount.mockResolvedValue(1);

      await syncEngine.queueOperation(SyncOperation.CREATE, 'posts', '123', {});

      expect(mockQueueManager.getPendingCount).toHaveBeenCalled();
      expect(syncEngine.getState().pendingChanges).toBe(1);
    });

    it('should queue UPDATE operation', async () => {
      await syncEngine.queueOperation(SyncOperation.UPDATE, 'posts', '456', { title: 'Updated' });

      expect(mockQueueManager.addToQueue).toHaveBeenCalledWith(
        SyncOperation.UPDATE,
        'posts',
        '456',
        { title: 'Updated' }
      );
    });

    it('should queue DELETE operation', async () => {
      await syncEngine.queueOperation(SyncOperation.DELETE, 'posts', '789', {});

      expect(mockQueueManager.addToQueue).toHaveBeenCalledWith(
        SyncOperation.DELETE,
        'posts',
        '789',
        {}
      );
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = syncEngine.getState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('lastSyncAt');
      expect(state).toHaveProperty('pendingChanges');
      expect(state).toHaveProperty('error');
      expect(state).toHaveProperty('isSyncing');
    });

    it('should return a copy of state', () => {
      const state1 = syncEngine.getState();
      const state2 = syncEngine.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('listeners', () => {
    beforeEach(async () => {
      await syncEngine.initialize();
    });

    it('should add listener and return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = syncEngine.addListener(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should notify listeners on state change', async () => {
      const listener = jest.fn();
      syncEngine.addListener(listener);

      await syncEngine.sync();

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls.length).toBeGreaterThan(0);
    });

    it('should allow multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      syncEngine.addListener(listener1);
      syncEngine.addListener(listener2);

      await syncEngine.sync();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should unsubscribe listener', async () => {
      const listener = jest.fn();
      const unsubscribe = syncEngine.addListener(listener);

      unsubscribe();

      await syncEngine.sync();

      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove listener manually', async () => {
      const listener = jest.fn();
      syncEngine.addListener(listener);
      syncEngine.removeListener(listener);

      await syncEngine.sync();

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle errors in listeners gracefully', async () => {
      const badListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      syncEngine.addListener(badListener);
      syncEngine.addListener(goodListener);

      await syncEngine.sync();

      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('getNetworkDetector', () => {
    it('should return network detector instance', () => {
      const detector = syncEngine.getNetworkDetector();

      expect(detector).toBe(mockNetworkDetector);
    });
  });

  describe('destroy', () => {
    beforeEach(async () => {
      await syncEngine.initialize();
    });

    it('should cleanup all resources', () => {
      syncEngine.destroy();

      expect(mockNetworkDetector.destroy).toHaveBeenCalled();
    });

    it('should clear all listeners', () => {
      const listener = jest.fn();
      syncEngine.addListener(listener);

      syncEngine.destroy();

      // State shouldn't be accessible after destroy
      expect(syncEngine.getState()).toBeDefined();
    });

    it('should stop background sync', async () => {
      jest.useFakeTimers();

      const engineWithBg = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        enableBackgroundSync: true,
        syncInterval: 1000,
      });

      await engineWithBg.initialize();
      engineWithBg.destroy();

      jest.advanceTimersByTime(2000);

      // Sync should not be called after destroy
      const initialCalls = mockPushSynchronizer.push.mock.calls.length;
      jest.advanceTimersByTime(2000);
      expect(mockPushSynchronizer.push.mock.calls.length).toBe(initialCalls);

      jest.useRealTimers();
    });
  });

  describe('background sync', () => {
    it('should trigger sync at intervals when enabled', async () => {
      jest.useFakeTimers();

      const engineWithBg = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        enableBackgroundSync: true,
        syncInterval: 1000,
      });

      await engineWithBg.initialize();

      jest.advanceTimersByTime(1100);

      expect(mockPushSynchronizer.push).toHaveBeenCalled();

      engineWithBg.destroy();
      jest.useRealTimers();
    });

    it('should not trigger sync when disabled', async () => {
      jest.useFakeTimers();

      const engineNoBg = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        enableBackgroundSync: false,
      });

      await engineNoBg.initialize();

      jest.advanceTimersByTime(10000);

      expect(mockPushSynchronizer.push).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not sync in background if offline', async () => {
      jest.useFakeTimers();

      const engineWithBg = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        enableBackgroundSync: true,
        syncInterval: 1000,
      });

      await engineWithBg.initialize();

      mockNetworkDetector.isOnline.mockReturnValue(false);

      jest.advanceTimersByTime(1100);

      expect(mockPushSynchronizer.push).not.toHaveBeenCalled();

      engineWithBg.destroy();
      jest.useRealTimers();
    });

    it('should not sync in background if already syncing', async () => {
      jest.useFakeTimers();

      mockPushSynchronizer.push.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ pushedCount: 0, failedCount: 0 }), 2000))
      );

      const engineWithBg = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        enableBackgroundSync: true,
        syncInterval: 500,
      });

      await engineWithBg.initialize();

      jest.advanceTimersByTime(600);
      const callsAfterFirst = mockPushSynchronizer.push.mock.calls.length;

      jest.advanceTimersByTime(600);
      const callsAfterSecond = mockPushSynchronizer.push.mock.calls.length;

      expect(callsAfterSecond).toBe(callsAfterFirst);

      engineWithBg.destroy();
      jest.useRealTimers();
    });
  });

  describe('network reconnection', () => {
    it('should trigger sync on network reconnection when enabled', async () => {
      let networkListener: any;

      mockNetworkDetector.addListener.mockImplementation((listener) => {
        networkListener = listener;
        return jest.fn();
      });

      const engineWithReconnect = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        syncOnReconnect: true,
      });

      await engineWithReconnect.initialize();

      // Simulate network reconnection
      networkListener({ isConnected: true, isInternetReachable: true, type: 'wifi' });

      // Give time for async sync to trigger
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPushSynchronizer.push).toHaveBeenCalled();

      engineWithReconnect.destroy();
    });

    it('should not trigger sync on network change when disabled', async () => {
      const engineNoReconnect = new SyncEngine({
        database: mockDatabase,
        tables: ['posts'],
        apiClient: mockApiClient,
        syncOnReconnect: false,
      });

      await engineNoReconnect.initialize();

      expect(mockNetworkDetector.addListener).not.toHaveBeenCalled();

      engineNoReconnect.destroy();
    });
  });
});
