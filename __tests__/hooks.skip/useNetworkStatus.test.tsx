import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { NetworkDetector } from '../../src/core/NetworkDetector';

describe('useNetworkStatus', () => {
  let mockNetworkDetector: jest.Mocked<NetworkDetector>;
  let listeners: any[];

  beforeEach(() => {
    listeners = [];

    mockNetworkDetector = {
      getStatus: jest.fn().mockReturnValue({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      }),
      isOnline: jest.fn().mockReturnValue(true),
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

  it('should return initial network status', () => {
    const { result } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(true);
    expect(result.current.type).toBe('wifi');
  });

  it('should subscribe to network changes on mount', () => {
    renderHook(() => useNetworkStatus(mockNetworkDetector));

    expect(mockNetworkDetector.addListener).toHaveBeenCalled();
  });

  it('should unsubscribe on unmount', () => {
    const unsubscribe = jest.fn();
    mockNetworkDetector.addListener.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('should update status when network changes', async () => {
    const { result } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    const newStatus = {
      isConnected: false,
      isInternetReachable: false,
      type: null,
    };

    mockNetworkDetector.isOnline.mockReturnValue(false);

    act(() => {
      listeners.forEach((listener) => listener(newStatus));
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isInternetReachable).toBe(false);
      expect(result.current.type).toBeNull();
      expect(result.current.isOnline).toBe(false);
    });
  });

  it('should handle wifi to cellular transition', async () => {
    const { result } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    const cellularStatus = {
      isConnected: true,
      isInternetReachable: true,
      type: 'cellular',
    };

    act(() => {
      listeners.forEach((listener) => listener(cellularStatus));
    });

    await waitFor(() => {
      expect(result.current.type).toBe('cellular');
      expect(result.current.isOnline).toBe(true);
    });
  });

  it('should handle online to offline transition', async () => {
    const { result } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    expect(result.current.isOnline).toBe(true);

    const offlineStatus = {
      isConnected: false,
      isInternetReachable: false,
      type: null,
    };

    mockNetworkDetector.isOnline.mockReturnValue(false);

    act(() => {
      listeners.forEach((listener) => listener(offlineStatus));
    });

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
      expect(result.current.isConnected).toBe(false);
    });
  });

  it('should handle offline to online transition', async () => {
    mockNetworkDetector.getStatus.mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
      type: null,
    });
    mockNetworkDetector.isOnline.mockReturnValue(false);

    const { result } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    expect(result.current.isOnline).toBe(false);

    const onlineStatus = {
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    };

    mockNetworkDetector.isOnline.mockReturnValue(true);

    act(() => {
      listeners.forEach((listener) => listener(onlineStatus));
    });

    await waitFor(() => {
      expect(result.current.isOnline).toBe(true);
      expect(result.current.isConnected).toBe(true);
    });
  });

  it('should handle unknown internet reachability', async () => {
    const { result } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    const unknownStatus = {
      isConnected: true,
      isInternetReachable: null,
      type: 'wifi',
    };

    act(() => {
      listeners.forEach((listener) => listener(unknownStatus));
    });

    await waitFor(() => {
      expect(result.current.isInternetReachable).toBeNull();
      expect(result.current.isConnected).toBe(true);
    });
  });

  it('should handle multiple rapid network changes', async () => {
    const { result } = renderHook(() => useNetworkStatus(mockNetworkDetector));

    const statuses = [
      { isConnected: false, isInternetReachable: false, type: null },
      { isConnected: true, isInternetReachable: true, type: 'cellular' },
      { isConnected: true, isInternetReachable: true, type: 'wifi' },
    ];

    for (const status of statuses) {
      mockNetworkDetector.isOnline.mockReturnValue(status.isConnected);

      act(() => {
        listeners.forEach((listener) => listener(status));
      });
    }

    await waitFor(() => {
      expect(result.current.type).toBe('wifi');
    });
  });
});
