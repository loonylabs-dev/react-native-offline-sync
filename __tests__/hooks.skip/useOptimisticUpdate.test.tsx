import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Database, Model } from '@nozbe/watermelondb';
import { useOptimisticUpdate } from '../../src/hooks/useOptimisticUpdate';
import { SyncEngine } from '../../src/core/SyncEngine';
import { SyncOperation } from '../../src/types';

describe('useOptimisticUpdate', () => {
  let mockDatabase: jest.Mocked<Database>;
  let mockSyncEngine: jest.Mocked<SyncEngine>;
  let mockCollection: any;
  let mockRecord: any;

  beforeEach(() => {
    mockRecord = {
      id: 'record-123',
      _raw: {
        id: 'record-123',
        title: 'Test',
        content: 'Content',
      },
    };

    mockCollection = {
      create: jest.fn((callback) => {
        callback(mockRecord);
        return Promise.resolve(mockRecord);
      }),
    };

    mockDatabase = {
      write: jest.fn((callback) => callback()),
      get: jest.fn(() => mockCollection),
    } as any;

    mockSyncEngine = {
      queueOperation: jest.fn().mockResolvedValue(undefined),
      sync: jest.fn().mockResolvedValue({
        success: true,
        stats: { pushedCount: 1, pulledCount: 0, failedCount: 0, duration: 100 },
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return execute function and isOptimistic state', () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    expect(typeof result.current.execute).toBe('function');
    expect(typeof result.current.isOptimistic).toBe('boolean');
    expect(result.current.isOptimistic).toBe(false);
  });

  it('should execute local write successfully', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    let createdRecord: any;

    await act(async () => {
      createdRecord = await result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
        return await collection.create((post: any) => {
          post.title = 'Test Post';
          post.content = 'Test Content';
        });
      });
    });

    expect(mockDatabase.write).toHaveBeenCalled();
    expect(mockDatabase.get).toHaveBeenCalledWith('posts');
    expect(mockCollection.create).toHaveBeenCalled();
    expect(createdRecord).toBe(mockRecord);
  });

  it('should queue operation after local write', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    await act(async () => {
      await result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
        return await collection.create((post: any) => {
          post.title = 'Test Post';
        });
      });
    });

    expect(mockSyncEngine.queueOperation).toHaveBeenCalledWith(
      SyncOperation.CREATE,
      'posts',
      'record-123',
      mockRecord._raw
    );
  });

  it('should trigger background sync after operation', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    await act(async () => {
      await result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
        return await collection.create(() => {});
      });
    });

    // Wait for background sync to be triggered
    await waitFor(() => {
      expect(mockSyncEngine.sync).toHaveBeenCalled();
    });
  });

  it('should set isOptimistic to true during operation', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    let wasOptimistic = false;

    mockCollection.create.mockImplementation((callback) => {
      callback(mockRecord);
      wasOptimistic = result.current.isOptimistic;
      return Promise.resolve(mockRecord);
    });

    await act(async () => {
      await result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
        return await collection.create(() => {});
      });
    });

    expect(wasOptimistic).toBe(true);
  });

  it('should reset isOptimistic after operation completes', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    await act(async () => {
      await result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
        return await collection.create(() => {});
      });
    });

    expect(result.current.isOptimistic).toBe(false);
  });

  it('should reset isOptimistic even if operation fails', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    mockCollection.create.mockRejectedValue(new Error('Database error'));

    await act(async () => {
      try {
        await result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
          return await collection.create(() => {});
        });
      } catch (error) {
        // Expected to throw
      }
    });

    expect(result.current.isOptimistic).toBe(false);
  });

  it('should handle UPDATE operations', async () => {
    mockRecord._raw.title = 'Updated Title';

    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    await act(async () => {
      await result.current.execute('posts', SyncOperation.UPDATE, async (collection) => {
        return await collection.create(() => {});
      });
    });

    expect(mockSyncEngine.queueOperation).toHaveBeenCalledWith(
      SyncOperation.UPDATE,
      'posts',
      'record-123',
      mockRecord._raw
    );
  });

  it('should handle DELETE operations', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    await act(async () => {
      await result.current.execute('posts', SyncOperation.DELETE, async (collection) => {
        return await collection.create(() => {});
      });
    });

    expect(mockSyncEngine.queueOperation).toHaveBeenCalledWith(
      SyncOperation.DELETE,
      'posts',
      'record-123',
      mockRecord._raw
    );
  });

  it('should handle multiple concurrent operations', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    const record1 = { id: '1', _raw: { id: '1' } };
    const record2 = { id: '2', _raw: { id: '2' } };
    const record3 = { id: '3', _raw: { id: '3' } };

    mockCollection.create
      .mockResolvedValueOnce(record1)
      .mockResolvedValueOnce(record2)
      .mockResolvedValueOnce(record3);

    await act(async () => {
      await Promise.all([
        result.current.execute('posts', SyncOperation.CREATE, async (c) => c.create(() => {})),
        result.current.execute('posts', SyncOperation.CREATE, async (c) => c.create(() => {})),
        result.current.execute('posts', SyncOperation.CREATE, async (c) => c.create(() => {})),
      ]);
    });

    expect(mockSyncEngine.queueOperation).toHaveBeenCalledTimes(3);
    expect(result.current.isOptimistic).toBe(false);
  });

  it('should continue with sync even if sync fails', async () => {
    mockSyncEngine.sync.mockRejectedValue(new Error('Sync failed'));

    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    await act(async () => {
      await result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
        return await collection.create(() => {});
      });
    });

    // Wait for background sync attempt
    await waitFor(() => {
      expect(mockSyncEngine.sync).toHaveBeenCalled();
    });

    // Operation should still complete successfully
    expect(result.current.isOptimistic).toBe(false);
  });

  it('should throw error if local write fails', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    mockDatabase.write.mockRejectedValue(new Error('Write failed'));

    await act(async () => {
      await expect(
        result.current.execute('posts', SyncOperation.CREATE, async (collection) => {
          return await collection.create(() => {});
        })
      ).rejects.toThrow('Write failed');
    });

    expect(mockSyncEngine.queueOperation).not.toHaveBeenCalled();
  });

  it('should work with different table names', async () => {
    const { result } = renderHook(() => useOptimisticUpdate(mockDatabase, mockSyncEngine));

    await act(async () => {
      await result.current.execute('comments', SyncOperation.CREATE, async (collection) => {
        return await collection.create(() => {});
      });
    });

    expect(mockDatabase.get).toHaveBeenCalledWith('comments');
    expect(mockSyncEngine.queueOperation).toHaveBeenCalledWith(
      SyncOperation.CREATE,
      'comments',
      expect.any(String),
      expect.any(Object)
    );
  });
});
