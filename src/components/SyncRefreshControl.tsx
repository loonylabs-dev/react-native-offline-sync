import React, { useState } from 'react';
import { RefreshControl, RefreshControlProps } from 'react-native';
import { SyncEngine } from '../core/SyncEngine';

export interface SyncRefreshControlProps extends Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> {
  syncEngine: SyncEngine;
}

/**
 * RefreshControl component that triggers sync on pull-to-refresh
 *
 * @example
 * ```typescript
 * <ScrollView refreshControl={<SyncRefreshControl syncEngine={syncEngine} />}>
 *   ...
 * </ScrollView>
 * ```
 */
export const SyncRefreshControl: React.FC<SyncRefreshControlProps> = ({
  syncEngine,
  ...props
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncEngine.sync();
    } catch (error) {
      console.error('Sync failed during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} {...props} />;
};
