# Error Handling Guide

This guide explains how the library handles errors and how you should handle them in your application.

## Overview

The sync engine follows an **offline-first** philosophy with automatic retry logic. Most errors are handled gracefully without requiring user intervention.

## Error Types

### 1. Network Errors

**What happens:**
- Sync fails due to no internet connection
- Server is unreachable
- Request timeout

**Library behavior:**
- Marks sync operation as failed
- Adds operation to retry queue
- Retries with exponential backoff
- Does NOT delete local changes

**Your responsibility:**

```typescript
const { syncStatus, error, isSyncing } = useSyncEngine(syncEngine);

// Show offline indicator
if (syncStatus === 'error' && !isOnline) {
  return (
    <Banner type="warning">
      You're offline. Changes will sync when connection is restored.
    </Banner>
  );
}
```

**Retry Logic:**
```
Attempt 1: Immediate
Attempt 2: 1 second delay
Attempt 3: 2 seconds delay
Attempt 4: 4 seconds delay (max retries reached)
```

After max retries, the operation stays in the queue and will be retried on next sync attempt.

### 2. Server Errors (5xx)

**What happens:**
- Server returns 500, 502, 503, 504
- Backend is down or overloaded

**Library behavior:**
- Same as network errors
- Retries with exponential backoff
- Logs error details

**Your responsibility:**

```typescript
const { error } = useSyncEngine(syncEngine);

if (error && error.message.includes('5')) {
  Alert.alert(
    'Server Issue',
    'The server is temporarily unavailable. Your changes are safe and will sync later.'
  );
}
```

### 3. Conflict Errors

**What happens:**
- Same record was modified locally and on server
- Timestamps conflict
- Concurrent edits

**Library behavior:**
- Applies configured conflict resolution strategy
- Default: `last-write-wins` (latest timestamp wins)
- Custom strategies can be implemented

**Conflict Resolution Strategies:**

```typescript
const syncEngine = new SyncEngine({
  database,
  tables: ['posts'],
  apiClient,
  conflictStrategy: 'last-write-wins', // Default
  // Or: 'server-wins', 'client-wins', 'custom'
});
```

**Custom Conflict Resolver:**

```typescript
const syncEngine = new SyncEngine({
  conflictStrategy: 'custom',
  customConflictResolver: (localRecord, serverRecord) => {
    // Your logic here
    if (localRecord.priority > serverRecord.priority) {
      return localRecord; // Keep local version
    }
    return serverRecord; // Keep server version
  },
});
```

**Your responsibility:**

```typescript
// Monitor conflicts (optional)
syncEngine.addListener((state) => {
  if (state.stats?.conflictsResolved > 0) {
    console.log(`Resolved ${state.stats.conflictsResolved} conflicts`);
  }
});
```

### 4. Validation Errors (4xx)

**What happens:**
- Server returns 400 Bad Request
- Data doesn't pass server validation
- Invalid payload format

**Library behavior:**
- Marks operation as permanently failed
- Removes from retry queue (won't retry)
- Logs error with payload details
- Triggers error callback

**Your responsibility:**

```typescript
const { error } = useSyncEngine(syncEngine);

if (error && error.message.includes('Validation')) {
  Alert.alert(
    'Data Error',
    'Some changes could not be synced due to invalid data. Please check and try again.'
  );

  // You might want to inspect failed records:
  const failedOperations = await getFailedSyncQueue();
  console.log('Failed operations:', failedOperations);
}
```

**Preventing Validation Errors:**

```typescript
class Post extends BaseModel {
  toSyncPayload(): Record<string, any> {
    // Validate before sending
    if (!this.title || this.title.trim() === '') {
      throw new Error('Title is required');
    }

    return {
      title: this.title.trim(),
      content: this.content,
    };
  }
}
```

### 5. Authentication Errors (401, 403)

**What happens:**
- Token expired
- Unauthorized request
- Forbidden access

**Library behavior:**
- Pauses sync
- Keeps failed operation in queue
- Will retry on next sync attempt
- Does NOT delete local changes

**Your responsibility:**

```typescript
const apiClient = {
  push: async (payload) => {
    const token = await getAuthToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('https://api.example.com/sync/push', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      // Token expired - refresh and retry
      await refreshAuthToken();
      throw new Error('Unauthorized - retrying');
    }

    return response.json();
  },
};

// In your app:
const { error } = useSyncEngine(syncEngine);

if (error && error.message.includes('Unauthorized')) {
  // Redirect to login or refresh token
  navigation.navigate('Login');
}
```

### 6. Database Errors

**What happens:**
- WatermelonDB write fails
- Schema mismatch
- Constraint violation

**Library behavior:**
- Logs error with full details
- Skips problematic record
- Continues with other records
- Does NOT crash the app

**Your responsibility:**

```typescript
// Enable debug logging to see database errors
const syncEngine = new SyncEngine({
  debug: true,
  // ...
});

// Monitor for database errors
syncEngine.addListener((state) => {
  if (state.error && state.error.message.includes('Database')) {
    console.error('Database error during sync:', state.error);
    Sentry.captureException(state.error); // Send to error tracking
  }
});
```

## Error Recovery

### 1. Manual Retry

```typescript
const { sync, isSyncing } = useSyncEngine(syncEngine);

// Manual sync retry
const handleRetrySync = async () => {
  try {
    await sync();
    Alert.alert('Success', 'Sync completed successfully');
  } catch (error) {
    Alert.alert('Sync Failed', 'Please try again later');
  }
};
```

### 2. Clear Failed Operations

```typescript
// If you want to clear permanently failed operations
const clearFailedQueue = async () => {
  // Get access to queue manager
  const queueManager = syncEngine['queueManager'];

  // Clear failed items (use with caution!)
  await queueManager.clearFailedItems();
};
```

### 3. Inspect Sync Queue

```typescript
// Debug sync queue to see pending/failed operations
const debugSyncQueue = async () => {
  const queue = await database.collections
    .get('sync_queue')
    .query()
    .fetch();

  console.log('Pending operations:', queue.length);

  queue.forEach((item) => {
    console.log(`${item.operation} ${item.tableName} - Retries: ${item.retryCount}`);
  });
};
```

## Error Monitoring

### 1. Status Listener

```typescript
const unsubscribe = syncEngine.addListener((state) => {
  console.log('Sync status:', state.status);
  console.log('Pending changes:', state.pendingChanges);

  if (state.error) {
    console.error('Sync error:', state.error.message);

    // Send to error tracking service
    Sentry.captureException(state.error, {
      extra: {
        status: state.status,
        pendingChanges: state.pendingChanges,
      },
    });
  }
});

// Cleanup
return () => unsubscribe();
```

### 2. React Hook Monitoring

```typescript
import { useSyncEngine } from '@loonylabs/react-native-offline-sync';

function SyncMonitor() {
  const { syncStatus, error, pendingChanges, lastSyncAt } = useSyncEngine(syncEngine);

  useEffect(() => {
    if (error) {
      // Log to analytics
      analytics.logEvent('sync_error', {
        error: error.message,
        pendingChanges,
      });
    }
  }, [error]);

  return (
    <View>
      <Text>Status: {syncStatus}</Text>
      <Text>Pending: {pendingChanges}</Text>
      {error && <Text style={{color: 'red'}}>Error: {error.message}</Text>}
    </View>
  );
}
```

## Best Practices

### ✅ DO

**1. Show user-friendly error messages**
```typescript
const friendlyErrorMessage = (error: Error): string => {
  if (error.message.includes('Network')) {
    return "You're offline. Changes will sync when you're back online.";
  }
  if (error.message.includes('5')) {
    return 'Server is temporarily unavailable. Please try again later.';
  }
  return 'Sync failed. Please try again.';
};

Alert.alert('Sync Error', friendlyErrorMessage(error));
```

**2. Provide offline indicators**
```typescript
import { OfflineBanner } from '@loonylabs/react-native-offline-sync';

<OfflineBanner networkDetector={syncEngine.getNetworkDetector()} />
```

**3. Enable debug logging during development**
```typescript
const syncEngine = new SyncEngine({
  debug: __DEV__, // Only in development
  // ...
});
```

**4. Handle auth errors gracefully**
```typescript
if (error?.message.includes('Unauthorized')) {
  await refreshToken();
  await sync(); // Retry after refreshing token
}
```

### ❌ DON'T

**1. Don't delete user data on sync errors**
```typescript
// ❌ NEVER do this
if (error) {
  await database.write(async () => {
    await post.destroyPermanently(); // Loses user data!
  });
}
```

**2. Don't ignore errors silently**
```typescript
// ❌ Bad
const { error } = useSyncEngine(syncEngine);
// ...do nothing with error

// ✅ Good
if (error) {
  console.error('Sync error:', error);
  showErrorToast(error.message);
}
```

**3. Don't retry indefinitely without user feedback**
```typescript
// ❌ Bad - Silent infinite loop
while (true) {
  try {
    await sync();
    break;
  } catch (error) {
    // User has no idea sync is failing
  }
}

// ✅ Good - Show progress and allow cancellation
let retries = 3;
while (retries > 0) {
  try {
    showToast(`Syncing... (${retries} attempts left)`);
    await sync();
    break;
  } catch (error) {
    retries--;
    if (retries === 0) {
      showErrorToast('Sync failed. Please try again later.');
    }
  }
}
```

**4. Don't block UI during sync**
```typescript
// ❌ Bad
const { isSyncing } = useSyncEngine(syncEngine);
if (isSyncing) return <LoadingScreen />; // Blocks entire app

// ✅ Good - Show indicator, allow app usage
if (isSyncing) {
  return (
    <View>
      <SyncIndicator />
      <AppContent /> {/* App still usable */}
    </View>
  );
}
```

## Common Scenarios

### Scenario 1: App starts offline

**Behavior:**
1. Sync engine initializes successfully
2. Counts pending changes in queue
3. Displays pending count to user
4. When online, automatically syncs

**Handling:**
```typescript
const { pendingChanges, isOnline } = useSyncEngine(syncEngine);

<View>
  {!isOnline && pendingChanges > 0 && (
    <Banner>
      {pendingChanges} changes will sync when you're back online.
    </Banner>
  )}
</View>
```

### Scenario 2: Sync fails after 3 retries

**Behavior:**
1. Operation stays in queue
2. Will retry on next sync attempt
3. User can manually trigger sync

**Handling:**
```typescript
const { error, sync, isSyncing } = useSyncEngine(syncEngine);

{error && (
  <View>
    <Text>Sync failed. Please check your connection.</Text>
    <Button onPress={sync} disabled={isSyncing}>
      Retry Sync
    </Button>
  </View>
)}
```

### Scenario 3: Server validation fails

**Behavior:**
1. Operation marked as permanently failed
2. Removed from retry queue
3. Error logged with details

**Handling:**
```typescript
// Implement validation locally to prevent server errors
const createPost = async (title: string, content: string) => {
  // Validate before creating
  if (!title || title.trim() === '') {
    Alert.alert('Error', 'Title is required');
    return;
  }

  if (content.length > 10000) {
    Alert.alert('Error', 'Content is too long (max 10,000 characters)');
    return;
  }

  // Create post
  await database.write(async () => {
    await postsCollection.create((post) => {
      post.title = title.trim();
      post.content = content;
    });
  });
};
```

## Debugging

### Enable Debug Logging

```typescript
const syncEngine = new SyncEngine({
  debug: true,
  // ...
});
```

**Output example:**
```
[SyncEngine] Initializing...
[SyncQueueManager] Loaded 5 pending operations
[PushSynchronizer] Pushing 5 changes
[PushSynchronizer] Batch 1/1 (5 items)
[NetworkDetector] Network status: online
[PushSynchronizer] Push successful: 5 items
[SyncEngine] Sync completed in 1234ms
```

### Inspect Sync Queue

```typescript
// Check what's in the queue
const debugQueue = async () => {
  const items = await database.collections
    .get('sync_queue')
    .query()
    .fetch();

  console.table(
    items.map((item) => ({
      operation: item.operation,
      table: item.tableName,
      retries: item.retryCount,
      error: item.error,
    }))
  );
};
```

## Support

If you encounter errors not covered here:
- Enable debug logging and check console
- Check [GitHub Issues](https://github.com/loonylabs-dev/react-native-offline-sync/issues)
- Ask in [GitHub Discussions](https://github.com/loonylabs-dev/react-native-offline-sync/discussions)
- Review [Example App](../example/) for error handling patterns
