import NetInfo from '@react-native-community/netinfo';
import { NetworkDetector } from '../../src/core/NetworkDetector';

describe('NetworkDetector', () => {
  let networkDetector: NetworkDetector;
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    mockUnsubscribe = jest.fn();
    (NetInfo.addEventListener as jest.Mock).mockReturnValue(mockUnsubscribe);
    networkDetector = new NetworkDetector(false);
  });

  afterEach(() => {
    networkDetector.destroy();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should fetch initial network state', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      expect(NetInfo.fetch).toHaveBeenCalled();
      expect(networkDetector.isOnline()).toBe(true);
    });

    it('should subscribe to network changes', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      expect(NetInfo.addEventListener).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Network init failed');
      (NetInfo.fetch as jest.Mock).mockRejectedValue(error);

      await expect(networkDetector.initialize()).rejects.toThrow('Network init failed');
    });
  });

  describe('destroy', () => {
    it('should unsubscribe from network changes', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();
      networkDetector.destroy();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should clear all listeners', async () => {
      const listener = jest.fn();
      networkDetector.addListener(listener);

      networkDetector.destroy();

      // Listeners should be cleared, so no notification happens
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isOnline', () => {
    it('should return true when connected and internet reachable', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      expect(networkDetector.isOnline()).toBe(true);
    });

    it('should return false when not connected', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });

      await networkDetector.initialize();

      expect(networkDetector.isOnline()).toBe(false);
    });

    it('should return false when connected but internet not reachable', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: false,
        type: 'wifi',
      });

      await networkDetector.initialize();

      expect(networkDetector.isOnline()).toBe(false);
    });

    it('should return true when isInternetReachable is null but connected', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: null,
        type: 'wifi',
      });

      await networkDetector.initialize();

      expect(networkDetector.isOnline()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return current network status', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      const status = networkDetector.getStatus();
      expect(status).toEqual({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });
    });

    it('should return a copy of the status (not reference)', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      const status1 = networkDetector.getStatus();
      const status2 = networkDetector.getStatus();

      expect(status1).not.toBe(status2); // Different objects
      expect(status1).toEqual(status2); // Same values
    });
  });

  describe('addListener / removeListener', () => {
    it('should add listener and notify on network change', async () => {
      const listener = jest.fn();

      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      networkDetector.addListener(listener);

      // Simulate network change via addEventListener callback
      const networkChangeCallback = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
      networkChangeCallback({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });

      expect(listener).toHaveBeenCalledWith({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });
    });

    it('should remove listener', async () => {
      const listener = jest.fn();

      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      networkDetector.addListener(listener);
      networkDetector.removeListener(listener);

      // Simulate network change
      const networkChangeCallback = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
      networkChangeCallback({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      networkDetector.addListener(listener1);
      networkDetector.addListener(listener2);

      // Simulate network change
      const networkChangeCallback = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
      networkChangeCallback({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('network state changes', () => {
    it('should update online status when network changes', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();

      expect(networkDetector.isOnline()).toBe(true);

      // Simulate going offline
      const networkChangeCallback = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
      networkChangeCallback({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });

      expect(networkDetector.isOnline()).toBe(false);
    });

    it('should notify listeners when network changes', async () => {
      const listener = jest.fn();

      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      });

      await networkDetector.initialize();
      networkDetector.addListener(listener);

      // Simulate network change
      const networkChangeCallback = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
      networkChangeCallback({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      });
    });
  });
});
