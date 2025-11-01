import { useEffect, useState, useCallback } from 'react';
import { SyncEngine } from '../core/SyncEngine';
import { SyncEngineState, SyncResult } from '../types';

/**
 * Hook to access sync engine functionality
 *
 * @example
 * ```typescript
 * const { sync, syncStatus, lastSyncAt, pendingChanges, error, isSyncing } = useSyncEngine(syncEngine);
 *
 * // Trigger manual sync
 * await sync();
 * ```
 */
export function useSyncEngine(syncEngine: SyncEngine) {
  const [state, setState] = useState<SyncEngineState>(syncEngine.getState());

  // Subscribe to sync state changes
  useEffect(() => {
    const unsubscribe = syncEngine.addListener((newState) => {
      setState(newState);
    });

    // Get initial state
    setState(syncEngine.getState());

    return unsubscribe;
  }, [syncEngine]);

  // Manual sync trigger
  const sync = useCallback(async (): Promise<SyncResult> => {
    return await syncEngine.sync();
  }, [syncEngine]);

  return {
    sync,
    syncStatus: state.status,
    lastSyncAt: state.lastSyncAt,
    pendingChanges: state.pendingChanges,
    error: state.error,
    isSyncing: state.isSyncing,
  };
}
