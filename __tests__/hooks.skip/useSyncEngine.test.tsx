import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSyncEngine } from '../../src/hooks/useSyncEngine';
import { SyncEngine } from '../../src/core/SyncEngine';
import { SyncStatus } from '../../src/types';

describe('useSyncEngine', () => {
  let mockSyncEngine: jest.Mocked<SyncEngine>;
  let listeners: any[];

  beforeEach(() => {
    listeners = [];

    mockSyncEngine = {
      sync: jest.fn().mockResolvedValue({
        success: true,
        stats: {
          pushedCount: 2,
          pulledCount: 3,
          failedCount: 0,
          duration: 100,
        },
      }),
      getState: jest.fn().mockReturnValue({
        status: SyncStatus.IDLE,
        lastSyncAt: null,
        pendingChanges: 0,
        error: null,
        isSyncing: false,
      }),
      addListener: jest.fn((listener) => {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        };
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
    listeners = [];
  });

  it('should return initial state from sync engine', () => {
    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    expect(result.current.syncStatus).toBe(SyncStatus.IDLE);
    expect(result.current.lastSyncAt).toBeNull();
    expect(result.current.pendingChanges).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.isSyncing).toBe(false);
  });

  it('should provide sync function', () => {
    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    expect(typeof result.current.sync).toBe('function');
  });

  it('should call sync engine sync method', async () => {
    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    await act(async () => {
      await result.current.sync();
    });

    expect(mockSyncEngine.sync).toHaveBeenCalled();
  });

  it('should subscribe to state changes on mount', () => {
    renderHook(() => useSyncEngine(mockSyncEngine));

    expect(mockSyncEngine.addListener).toHaveBeenCalled();
  });

  it('should unsubscribe on unmount', () => {
    const unsubscribe = jest.fn();
    mockSyncEngine.addListener.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useSyncEngine(mockSyncEngine));

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('should update state when sync engine state changes', async () => {
    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    const newState = {
      status: SyncStatus.SYNCING,
      lastSyncAt: null,
      pendingChanges: 5,
      error: null,
      isSyncing: true,
    };

    act(() => {
      listeners.forEach((listener) => listener(newState));
    });

    await waitFor(() => {
      expect(result.current.syncStatus).toBe(SyncStatus.SYNCING);
      expect(result.current.pendingChanges).toBe(5);
      expect(result.current.isSyncing).toBe(true);
    });
  });

  it('should handle sync errors', async () => {
    const error = new Error('Sync failed');
    mockSyncEngine.sync.mockRejectedValue(error);

    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    await act(async () => {
      try {
        await result.current.sync();
      } catch (e) {
        // Expected to throw
      }
    });

    expect(mockSyncEngine.sync).toHaveBeenCalled();
  });

  it('should update lastSyncAt after successful sync', async () => {
    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    const timestamp = Date.now();

    act(() => {
      listeners.forEach((listener) =>
        listener({
          status: SyncStatus.IDLE,
          lastSyncAt: timestamp,
          pendingChanges: 0,
          error: null,
          isSyncing: false,
        })
      );
    });

    await waitFor(() => {
      expect(result.current.lastSyncAt).toBe(timestamp);
    });
  });

  it('should update error state on sync error', async () => {
    const error = new Error('Network error');

    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    act(() => {
      listeners.forEach((listener) =>
        listener({
          status: SyncStatus.ERROR,
          lastSyncAt: null,
          pendingChanges: 0,
          error,
          isSyncing: false,
        })
      );
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
      expect(result.current.syncStatus).toBe(SyncStatus.ERROR);
    });
  });

  it('should handle multiple sync calls', async () => {
    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    await act(async () => {
      await result.current.sync();
      await result.current.sync();
      await result.current.sync();
    });

    expect(mockSyncEngine.sync).toHaveBeenCalledTimes(3);
  });

  it('should reflect isSyncing during sync operation', async () => {
    const { result } = renderHook(() => useSyncEngine(mockSyncEngine));

    act(() => {
      listeners.forEach((listener) =>
        listener({
          status: SyncStatus.SYNCING,
          lastSyncAt: null,
          pendingChanges: 0,
          error: null,
          isSyncing: true,
        })
      );
    });

    await waitFor(() => {
      expect(result.current.isSyncing).toBe(true);
    });
  });
});
