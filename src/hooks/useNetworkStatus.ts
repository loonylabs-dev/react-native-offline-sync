import { useEffect, useState } from 'react';
import { NetworkDetector } from '../core/NetworkDetector';
import { NetworkStatus } from '../types';

/**
 * Hook to monitor network status
 *
 * @example
 * ```typescript
 * const { isOnline, isConnected, type } = useNetworkStatus(networkDetector);
 *
 * if (!isOnline) {
 *   return <OfflineBanner />;
 * }
 * ```
 */
export function useNetworkStatus(networkDetector: NetworkDetector) {
  const [status, setStatus] = useState<NetworkStatus>(networkDetector.getStatus());

  useEffect(() => {
    const unsubscribe = networkDetector.addListener((newStatus) => {
      setStatus(newStatus);
    });

    // Get initial status
    setStatus(networkDetector.getStatus());

    return unsubscribe;
  }, [networkDetector]);

  return {
    isOnline: networkDetector.isOnline(),
    isConnected: status.isConnected,
    isInternetReachable: status.isInternetReachable,
    type: status.type,
  };
}
