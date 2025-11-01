import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NetworkDetector } from '../core/NetworkDetector';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export interface OfflineBannerProps {
  networkDetector: NetworkDetector;
  message?: string;
  style?: any;
}

/**
 * Banner that appears when device is offline
 *
 * @example
 * ```typescript
 * <OfflineBanner networkDetector={networkDetector} />
 * ```
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  networkDetector,
  message = 'You are offline. Changes will sync when back online.',
  style,
}) => {
  const { isOnline } = useNetworkStatus(networkDetector);

  if (isOnline) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
