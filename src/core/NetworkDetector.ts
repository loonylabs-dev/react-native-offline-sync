import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { NetworkStatus, NetworkStatusListener } from '../types';
import { createLogger } from '../utils';

/**
 * Network detector using NetInfo
 * Monitors network connectivity and notifies listeners of changes
 */
export class NetworkDetector {
  private listeners: Set<NetworkStatusListener> = new Set();
  private currentStatus: NetworkStatus = {
    isConnected: false,
    isInternetReachable: null,
    type: null,
  };
  private unsubscribe?: () => void;
  private logger = createLogger('[NetworkDetector]', false);

  constructor(debug: boolean = false) {
    this.logger.setDebug(debug);
  }

  /**
   * Initialize network monitoring
   */
  async initialize(): Promise<void> {
    try {
      // Get initial network state
      const state = await NetInfo.fetch();
      this.updateStatus(state);

      // Subscribe to network state changes
      this.unsubscribe = NetInfo.addEventListener((state) => {
        this.updateStatus(state);
      });

      this.logger.log('Network detector initialized');
    } catch (error) {
      this.logger.error('Failed to initialize network detector:', error);
      throw error;
    }
  }

  /**
   * Clean up network monitoring
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.listeners.clear();
    this.logger.log('Network detector destroyed');
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return { ...this.currentStatus };
  }

  /**
   * Check if device is online
   */
  isOnline(): boolean {
    return this.currentStatus.isConnected && this.currentStatus.isInternetReachable !== false;
  }

  /**
   * Add a listener for network status changes
   */
  addListener(listener: NetworkStatusListener): () => void {
    this.listeners.add(listener);
    this.logger.log('Added network status listener');

    // Return unsubscribe function
    return () => {
      this.removeListener(listener);
    };
  }

  /**
   * Remove a listener
   */
  removeListener(listener: NetworkStatusListener): void {
    this.listeners.delete(listener);
    this.logger.log('Removed network status listener');
  }

  /**
   * Update network status and notify listeners
   */
  private updateStatus(state: NetInfoState): void {
    const previousStatus = { ...this.currentStatus };

    this.currentStatus = {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? null,
      type: state.type || null,
    };

    // Check if status actually changed
    const statusChanged =
      previousStatus.isConnected !== this.currentStatus.isConnected ||
      previousStatus.isInternetReachable !== this.currentStatus.isInternetReachable;

    if (statusChanged) {
      this.logger.log('Network status changed:', this.currentStatus);
      this.notifyListeners();
    }
  }

  /**
   * Notify all listeners of status change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentStatus);
      } catch (error) {
        this.logger.error('Error in network status listener:', error);
      }
    });
  }
}
