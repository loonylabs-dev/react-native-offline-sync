import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SyncEngine } from '../core/SyncEngine';
import { useSyncEngine } from '../hooks/useSyncEngine';
import { SyncStatus } from '../types';

export interface SyncStatusBadgeProps {
  syncEngine: SyncEngine;
  style?: any;
}

/**
 * Badge component showing current sync status
 *
 * @example
 * ```typescript
 * <SyncStatusBadge syncEngine={syncEngine} />
 * ```
 */
export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ syncEngine, style }) => {
  const { syncStatus, pendingChanges, isSyncing } = useSyncEngine(syncEngine);

  const getStatusColor = () => {
    switch (syncStatus) {
      case SyncStatus.SYNCING:
        return '#3b82f6'; // blue
      case SyncStatus.ERROR:
        return '#ef4444'; // red
      default:
        return pendingChanges > 0 ? '#f59e0b' : '#10b981'; // amber or green
    }
  };

  const getStatusText = () => {
    if (isSyncing) return 'Syncing...';
    if (syncStatus === SyncStatus.ERROR) return 'Sync Error';
    if (pendingChanges > 0) return `${pendingChanges} pending`;
    return 'Synced';
  };

  return (
    <View style={[styles.container, { backgroundColor: getStatusColor() }, style]}>
      {isSyncing && <ActivityIndicator size="small" color="#fff" style={styles.spinner} />}
      <Text style={styles.text}>{getStatusText()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  spinner: {
    marginRight: 6,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
