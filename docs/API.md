# API Reference

Complete API documentation for @loonylabs/react-native-offline-sync.

## Table of Contents

- [Core Classes](#core-classes)
  - [SyncEngine](#syncengine)
  - [NetworkDetector](#networkdetector)
- [Database](#database)
  - [BaseModel](#basemodel)
  - [Schema Helpers](#schema-helpers)
- [React Hooks](#react-hooks)
  - [useSyncEngine](#usesyncengine)
  - [useNetworkStatus](#usenetworkstatus)
  - [useOptimisticUpdate](#useoptimisticupdate)
- [UI Components](#ui-components)
  - [SyncStatusBadge](#syncstatusbadge)
  - [OfflineBanner](#offlinebanner)
  - [SyncRefreshControl](#syncrefreshcontrol)
- [Types](#types)
- [Utilities](#utilities)

---

## Core Classes

### SyncEngine

Main orchestrator for all synchronization operations.

#### Constructor

```typescript
new SyncEngine(config: SyncEngineConfig)
```

**Parameters:**

- `config.database` (Database) - WatermelonDB database instance
- `config.tables` (string[]) - Array of table names to sync
- `config.apiClient` (ApiClient) - API client implementing push/pull methods
- `config.conflictStrategy?` (ConflictStrategy) - Conflict resolution strategy (default: `'last-write-wins'`)
- `config.customConflictResolver?` (ConflictResolverFn) - Custom conflict resolver function
- `config.syncInterval?` (number) - Sync interval in milliseconds (default: `300000` = 5 minutes)
- `config.maxRetries?` (number) - Maximum retry attempts (default: `3`)
- `config.retryDelayBase?` (number) - Base delay for exponential backoff (default: `1000`ms)
- `config.enableBackgroundSync?` (boolean) - Enable automatic background sync (default: `true`)
- `config.syncOnReconnect?` (boolean) - Auto-sync on network reconnection (default: `true`)
- `config.pushBatchSize?` (number) - Batch size for push operations (default: `50`)
- `config.debug?` (boolean) - Enable debug logging (default: `false`)

**Example:**

```typescript
import { SyncEngine } from '@loonylabs/react-native-offline-sync';

const syncEngine = new SyncEngine({
  database,
  tables: ['posts', 'comments'],
  apiClient: {
    push: async (payload) => {
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return response.json();
    },
    pull: async (payload) => {
      const response = await fetch('/api/sync/pull', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return response.json();
    },
  },
  conflictStrategy: 'last-write-wins',
  debug: __DEV__,
});
```

#### Methods

##### `initialize(): Promise<void>`

Initializes the sync engine. Must be called before any sync operations.

```typescript
await syncEngine.initialize();
```

##### `sync(): Promise<SyncResult>`

Manually triggers a sync operation (push then pull).

**Returns:** `Promise<SyncResult>`

```typescript
const result = await syncEngine.sync();
console.log(`Pushed: ${result.stats.pushedCount}, Pulled: ${result.stats.pulledCount}`);
```

##### `queueOperation(operation, tableName, recordId, payload): Promise<void>`

Queues an operation for synchronization.

**Parameters:**
- `operation` (SyncOperation) - Operation type: `'CREATE'`, `'UPDATE'`, or `'DELETE'`
- `tableName` (string) - Table name
- `recordId` (string) - Record ID
- `payload` (Record<string, any>) - Record data

```typescript
await syncEngine.queueOperation('CREATE', 'posts', post.id, post._raw);
```

##### `getState(): SyncEngineState`

Gets the current sync engine state.

**Returns:** `SyncEngineState`

```typescript
const state = syncEngine.getState();
console.log('Status:', state.status);
console.log('Pending changes:', state.pendingChanges);
```

##### `addStatusListener(listener): () => void`

Subscribes to sync status changes.

**Parameters:**
- `listener` (SyncStatusListener) - Callback function

**Returns:** Unsubscribe function

```typescript
const unsubscribe = syncEngine.addStatusListener((state) => {
  console.log('Sync status:', state.status);
});

// Later: unsubscribe()
```

##### `getNetworkDetector(): NetworkDetector`

Gets the network detector instance.

**Returns:** `NetworkDetector`

```typescript
const networkDetector = syncEngine.getNetworkDetector();
```

##### `destroy(): void`

Cleans up resources (stops background sync, removes listeners).

```typescript
syncEngine.destroy();
```

---

### NetworkDetector

Monitors network connectivity status.

#### Constructor

```typescript
new NetworkDetector(debug?: boolean)
```

#### Methods

##### `initialize(): Promise<void>`

Initializes network monitoring.

```typescript
await networkDetector.initialize();
```

##### `isOnline(): boolean`

Checks if device is online.

**Returns:** `boolean`

```typescript
if (networkDetector.isOnline()) {
  console.log('Device is online');
}
```

##### `getStatus(): NetworkStatus`

Gets current network status.

**Returns:** `NetworkStatus`

```typescript
const status = networkDetector.getStatus();
console.log('Connected:', status.isConnected);
console.log('Type:', status.type);
```

##### `addListener(listener): () => void`

Subscribes to network status changes.

**Parameters:**
- `listener` (NetworkStatusListener) - Callback function

**Returns:** Unsubscribe function

```typescript
const unsubscribe = networkDetector.addListener((status) => {
  console.log('Network changed:', status.isConnected);
});
```

##### `destroy(): void`

Cleans up network monitoring.

```typescript
networkDetector.destroy();
```

---

## Database

### BaseModel

Base model class with sync metadata. All synced models should extend this.

```typescript
import { BaseModel } from '@loonylabs/react-native-offline-sync';
import { text, field, date } from '@nozbe/watermelondb/decorators';

class Post extends BaseModel {
  static table = 'posts';

  @text('title') title!: string;
  @text('content') content!: string;
  @field('author_id') authorId!: string;
  @date('published_at') publishedAt!: Date;
}
```

**Inherited Fields:**
- `serverId` (string | null) - Server-assigned ID
- `syncedAt` (number | null) - Last sync timestamp
- `deletedAt` (number | null) - Soft delete timestamp

**Note:** Always use soft deletes for synced models. Never use `destroyPermanently()`.

---

### Schema Helpers

#### `syncQueueTableSchema`

Pre-configured schema for the sync queue table. Must be included in your schema.

```typescript
import { appSchema } from '@nozbe/watermelondb';
import { syncQueueTableSchema } from '@loonylabs/react-native-offline-sync';

const schema = appSchema({
  version: 1,
  tables: [
    syncQueueTableSchema,
    // ... your other tables
  ],
});
```

#### `createTableSchemaWithSync(tableName, columns)`

Creates a table schema with sync metadata columns.

**Parameters:**
- `tableName` (string) - Table name
- `columns` (ColumnSchema[]) - Your custom columns

**Returns:** `TableSchema`

```typescript
import { createTableSchemaWithSync } from '@loonylabs/react-native-offline-sync';

const postsTable = createTableSchemaWithSync('posts', [
  { name: 'title', type: 'string' },
  { name: 'content', type: 'string' },
  { name: 'author_id', type: 'string', isIndexed: true },
]);
```

**Automatically adds:**
- `server_id` (string, nullable)
- `synced_at` (number, nullable)
- `deleted_at` (number, nullable)

---

## React Hooks

### useSyncEngine

Hook for accessing sync engine state and operations in React components.

```typescript
import { useSyncEngine } from '@loonylabs/react-native-offline-sync';

function MyComponent() {
  const {
    sync,           // () => Promise<SyncResult>
    syncStatus,     // 'idle' | 'syncing' | 'error'
    lastSyncAt,     // number | null
    pendingChanges, // number
    error,          // Error | null
    isSyncing,      // boolean
  } = useSyncEngine(syncEngine);

  return (
    <Button onPress={sync} disabled={isSyncing}>
      {isSyncing ? 'Syncing...' : `Sync (${pendingChanges} pending)`}
    </Button>
  );
}
```

---

### useNetworkStatus

Hook for monitoring network connectivity.

```typescript
import { useNetworkStatus } from '@loonylabs/react-native-offline-sync';

function MyComponent() {
  const {
    isOnline,           // boolean
    isConnected,        // boolean
    isInternetReachable, // boolean | null
    type,               // string | null ('wifi', 'cellular', etc.)
  } = useNetworkStatus(networkDetector);

  return (
    <View>
      {!isOnline && <Text>You are offline</Text>}
    </View>
  );
}
```

---

### useOptimisticUpdate

Hook for performing optimistic UI updates with automatic sync queueing.

```typescript
import { useOptimisticUpdate } from '@loonylabs/react-native-offline-sync';

function MyComponent() {
  const { execute, isOptimistic } = useOptimisticUpdate(database, syncEngine);

  const createPost = async (title: string, content: string) => {
    const post = await execute('posts', 'CREATE', async (collection) => {
      return await collection.create((p) => {
        p.title = title;
        p.content = content;
      });
    });

    console.log('Post created locally:', post.id);
    // Automatically queued for sync in background
  };

  return (
    <Button onPress={() => createPost('Title', 'Content')} disabled={isOptimistic}>
      Create Post
    </Button>
  );
}
```

---

## UI Components

### SyncStatusBadge

Visual indicator showing current sync status.

```typescript
import { SyncStatusBadge } from '@loonylabs/react-native-offline-sync';

<SyncStatusBadge syncEngine={syncEngine} />
```

**Props:**
- `syncEngine` (SyncEngine) - Sync engine instance
- `style?` (ViewStyle) - Custom container style
- `textStyle?` (TextStyle) - Custom text style

**Displays:**
- Green badge: "Synced" (idle, no pending changes)
- Blue badge: "Syncing..." (sync in progress)
- Yellow badge: "X Pending" (idle with pending changes)
- Red badge: "Error" (sync failed)

---

### OfflineBanner

Banner displayed when device is offline.

```typescript
import { OfflineBanner } from '@loonylabs/react-native-offline-sync';

<OfflineBanner
  networkDetector={networkDetector}
  message="You are offline"
/>
```

**Props:**
- `networkDetector` (NetworkDetector) - Network detector instance
- `message?` (string) - Custom message (default: "You are offline")
- `style?` (ViewStyle) - Custom container style
- `textStyle?` (TextStyle) - Custom text style

---

### SyncRefreshControl

Pull-to-refresh control that triggers sync.

```typescript
import { SyncRefreshControl } from '@loonylabs/react-native-offline-sync';
import { ScrollView } from 'react-native';

<ScrollView
  refreshControl={<SyncRefreshControl syncEngine={syncEngine} />}
>
  {/* content */}
</ScrollView>
```

**Props:**
- `syncEngine` (SyncEngine) - Sync engine instance
- All standard `RefreshControl` props (colors, tintColor, etc.)

---

## Types

### SyncOperation

```typescript
enum SyncOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}
```

### SyncStatus

```typescript
enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  ERROR = 'error',
}
```

### ConflictStrategy

```typescript
enum ConflictStrategy {
  LAST_WRITE_WINS = 'last-write-wins',
  SERVER_WINS = 'server-wins',
  CLIENT_WINS = 'client-wins',
  CUSTOM = 'custom',
}
```

### SyncResult

```typescript
interface SyncResult {
  success: boolean;
  stats: {
    pushedCount: number;
    pulledCount: number;
    failedCount: number;
    duration: number;
  };
  error?: Error;
}
```

### SyncEngineState

```typescript
interface SyncEngineState {
  status: SyncStatus;
  lastSyncAt: number | null;
  pendingChanges: number;
  error: Error | null;
  isSyncing: boolean;
}
```

### ApiClient

```typescript
interface ApiClient {
  push: (payload: PushPayload) => Promise<PushResponse>;
  pull: (payload: PullPayload) => Promise<PullResponse>;
}

interface PushPayload {
  changes: {
    tableName: string;
    operation: SyncOperation;
    recordId: string;
    data: Record<string, any>;
  }[];
}

interface PushResponse {
  success: boolean;
  results: {
    recordId: string;
    serverId?: string;
    serverUpdatedAt?: number;
    error?: string;
  }[];
}

interface PullPayload {
  lastSyncAt: number | null;
  tables: string[];
}

interface PullResponse {
  timestamp: number;
  changes: {
    [tableName: string]: {
      created: Record<string, any>[];
      updated: Record<string, any>[];
      deleted: string[];
    };
  };
}
```

### ConflictResolverFn

```typescript
type ConflictResolverFn = (context: ConflictContext) => 'local' | 'server' | Record<string, any>;

interface ConflictContext {
  tableName: string;
  recordId: string;
  localData: Record<string, any>;
  serverData: Record<string, any>;
  localUpdatedAt: number;
  serverUpdatedAt: number;
}
```

---

## Utilities

### createLogger

Creates a logger instance with optional debug mode.

```typescript
import { createLogger } from '@loonylabs/react-native-offline-sync';

const logger = createLogger('[MyComponent]', true); // debug enabled

logger.log('Info message');     // Only logged in debug mode
logger.warn('Warning');          // Always logged
logger.error('Error', error);    // Always logged
```

### Timestamp Utilities

```typescript
import { now, formatTimestamp } from '@loonylabs/react-native-offline-sync';

const timestamp = now(); // Current timestamp in milliseconds
const formatted = formatTimestamp(timestamp); // "2025-11-02 14:30:45"
```

---

## Advanced Usage

### Custom Conflict Resolution

```typescript
const syncEngine = new SyncEngine({
  database,
  tables: ['posts'],
  apiClient,
  conflictStrategy: ConflictStrategy.CUSTOM,
  customConflictResolver: (context) => {
    // Always prefer server for metadata, but keep local content
    return {
      ...context.serverData,
      content: context.localData.content, // Keep local content
    };
  },
});
```

### Manual Queue Management

```typescript
// Queue a create operation
await syncEngine.queueOperation('CREATE', 'posts', post.id, post._raw);

// Queue an update operation
await syncEngine.queueOperation('UPDATE', 'posts', post.id, post._raw);

// Queue a delete operation (soft delete)
await syncEngine.queueOperation('DELETE', 'posts', post.id, { deleted_at: Date.now() });
```

### Listening to Sync Events

```typescript
const unsubscribe = syncEngine.addStatusListener((state) => {
  switch (state.status) {
    case SyncStatus.IDLE:
      console.log('Sync completed, pending:', state.pendingChanges);
      break;
    case SyncStatus.SYNCING:
      console.log('Sync in progress...');
      break;
    case SyncStatus.ERROR:
      console.error('Sync failed:', state.error);
      break;
  }
});

// Clean up when component unmounts
useEffect(() => unsubscribe, []);
```

### Debug Mode

Enable debug logging to troubleshoot sync issues:

```typescript
const syncEngine = new SyncEngine({
  // ... other config
  debug: __DEV__, // Enable in development
});
```

Debug logs include:
- Sync operation start/end
- Queue operations
- Network status changes
- Conflict resolution decisions
- Push/pull statistics

---

## Error Handling

See [ERROR_HANDLING.md](./ERROR_HANDLING.md) for comprehensive error handling guide.

---

## Migration Guide

### From 0.x to 1.0 (future)

Breaking changes and migration steps will be documented here when we reach 1.0.

---

## Support

- [GitHub Issues](https://github.com/loonylabs-dev/react-native-offline-sync/issues)
- [Main Documentation](../README.md)
- [Requirements Guide](./REQUIREMENTS.md)
