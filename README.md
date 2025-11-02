# @loonylabs/react-native-offline-sync

Production-ready offline-first synchronization engine for React Native with WatermelonDB.

[![npm version](https://badge.fury.io/js/%40loonylabs%2Freact-native-offline-sync.svg)](https://www.npmjs.com/package/@loonylabs/react-native-offline-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Offline-First Architecture** - Write locally first, sync in background
- **Automatic Sync** - Background sync with configurable intervals
- **Network Detection** - Auto-sync on reconnection
- **Conflict Resolution** - Multiple strategies (Last-Write-Wins, Server-Wins, Client-Wins, Custom)
- **Retry Logic** - Exponential backoff for failed operations
- **Type-Safe** - Full TypeScript support
- **Observable** - Reactive sync status updates
- **Optimistic UI** - Instant user feedback
- **React Hooks** - Easy integration with React Native apps
- **UI Components** - Pre-built sync status indicators
- **Battle-Tested** - Extracted from production apps

## Installation

```bash
npm install @loonylabs/react-native-offline-sync
```

### Peer Dependencies

```bash
npm install @nozbe/watermelondb @react-native-community/netinfo @react-native-async-storage/async-storage
```

## Quick Start

### 1. Setup WatermelonDB Schema

```typescript
import { appSchema } from '@nozbe/watermelondb';
import { syncQueueTableSchema, createTableSchemaWithSync } from '@loonylabs/react-native-offline-sync';

const schema = appSchema({
  version: 1,
  tables: [
    // Add sync queue table
    syncQueueTableSchema,

    // Your tables with sync metadata
    createTableSchemaWithSync('posts', [
      { name: 'title', type: 'string' },
      { name: 'content', type: 'string' },
    ]),
  ],
});
```

### 2. Create Models

```typescript
import { BaseModel } from '@loonylabs/react-native-offline-sync';
import { text } from '@nozbe/watermelondb/decorators';

class Post extends BaseModel {
  static table = 'posts';

  @text('title') title!: string;
  @text('content') content!: string;
}
```

### 3. Initialize Sync Engine

```typescript
import { SyncEngine } from '@loonylabs/react-native-offline-sync';
import { database } from './database';

// Create API client
const apiClient = {
  push: async (payload) => {
    const response = await fetch('https://api.example.com/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.json();
  },
  pull: async (payload) => {
    const response = await fetch('https://api.example.com/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.json();
  },
};

// Initialize sync engine
const syncEngine = new SyncEngine({
  database,
  tables: ['posts'],
  apiClient,
  syncInterval: 5 * 60 * 1000, // 5 minutes
  conflictStrategy: 'last-write-wins',
});

await syncEngine.initialize();
```

### 4. Use in React Components

```typescript
import { useSyncEngine, OfflineBanner } from '@loonylabs/react-native-offline-sync';

function App() {
  const { sync, syncStatus, pendingChanges, isSyncing } = useSyncEngine(syncEngine);

  return (
    <View>
      <OfflineBanner networkDetector={syncEngine.getNetworkDetector()} />

      <Button onPress={sync} disabled={isSyncing}>
        {isSyncing ? 'Syncing...' : `Sync (${pendingChanges} pending)`}
      </Button>
    </View>
  );
}
```

## API Reference

### SyncEngine

Main orchestrator for all sync operations.

```typescript
const syncEngine = new SyncEngine({
  database: Database,           // WatermelonDB instance
  tables: string[],             // Tables to sync
  apiClient: ApiClient,         // API client for server communication
  conflictStrategy?: ConflictStrategy,  // Default: 'last-write-wins'
  syncInterval?: number,        // Default: 300000 (5 min)
  maxRetries?: number,          // Default: 3
  enableBackgroundSync?: boolean, // Default: true
  syncOnReconnect?: boolean,    // Default: true
  pushBatchSize?: number,       // Default: 50
  debug?: boolean,              // Default: false
});

await syncEngine.initialize();
await syncEngine.sync();
syncEngine.destroy();
```

### Hooks

#### useSyncEngine

Access sync engine state and operations.

```typescript
const {
  sync,           // () => Promise<SyncResult>
  syncStatus,     // 'idle' | 'syncing' | 'error'
  lastSyncAt,     // number | null
  pendingChanges, // number
  error,          // Error | null
  isSyncing,      // boolean
} = useSyncEngine(syncEngine);
```

#### useNetworkStatus

Monitor network connectivity.

```typescript
const {
  isOnline,           // boolean
  isConnected,        // boolean
  isInternetReachable, // boolean | null
  type,               // string | null
} = useNetworkStatus(networkDetector);
```

#### useOptimisticUpdate

Perform optimistic UI updates.

```typescript
const { execute, isOptimistic } = useOptimisticUpdate(database, syncEngine);

const createPost = async (data) => {
  return execute('posts', 'CREATE', async (collection) => {
    return await collection.create((post) => {
      post.title = data.title;
      post.content = data.content;
    });
  });
};
```

### Components

#### SyncStatusBadge

Visual indicator of sync status.

```typescript
<SyncStatusBadge syncEngine={syncEngine} />
```

#### OfflineBanner

Banner shown when device is offline.

```typescript
<OfflineBanner
  networkDetector={networkDetector}
  message="You are offline"
/>
```

#### SyncRefreshControl

Pull-to-refresh with sync.

```typescript
<ScrollView
  refreshControl={<SyncRefreshControl syncEngine={syncEngine} />}
>
  {/* content */}
</ScrollView>
```

## Conflict Resolution

### Built-in Strategies

- **Last-Write-Wins** (default): Most recent timestamp wins
- **Server-Wins**: Server data always takes precedence
- **Client-Wins**: Local data always takes precedence
- **Custom**: Provide your own resolution function

### Custom Conflict Resolver

```typescript
const syncEngine = new SyncEngine({
  // ... other config
  conflictStrategy: 'custom',
  customConflictResolver: (context) => {
    // context: { tableName, recordId, localData, serverData, localUpdatedAt, serverUpdatedAt }

    // Return 'local', 'server', or merged data object
    return {
      ...context.serverData,
      localField: context.localData.localField, // Keep local value
    };
  },
});
```

## Backend API Requirements

Your backend needs to implement two endpoints:

### POST /sync/push

Receives local changes to apply on server.

**Request:**
```json
{
  "changes": [
    {
      "tableName": "posts",
      "operation": "CREATE",
      "recordId": "local-id-123",
      "data": { "title": "Hello", "content": "World" }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "recordId": "local-id-123",
      "serverId": "server-id-456",
      "serverUpdatedAt": 1234567890,
      "error": null
    }
  ]
}
```

### POST /sync/pull

Returns server changes since last sync.

**Request:**
```json
{
  "lastSyncAt": 1234567890,
  "tables": ["posts"]
}
```

**Response:**
```json
{
  "timestamp": 1234567900,
  "changes": {
    "posts": {
      "created": [{ "id": "1", "title": "New Post" }],
      "updated": [{ "id": "2", "title": "Updated Post" }],
      "deleted": ["3"]
    }
  }
}
```

## Performance Tips

1. **Batch Operations**: Use `pushBatchSize` to control batch sizes
2. **Sync Interval**: Adjust based on your app's needs
3. **Tables**: Only sync tables that need it
4. **Network Detection**: Disable if not needed
5. **Debug Mode**: Disable in production

## Documentation

- **[Requirements & Conventions](docs/REQUIREMENTS.md)** - Required schema setup, soft deletes, API client
- **[Error Handling Guide](docs/ERROR_HANDLING.md)** - Error types, recovery strategies, best practices
- **[API Reference](docs/API.md)** - Complete API documentation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [Loonylabs](https://github.com/loonylabs-dev)

## Support

- [GitHub Issues](https://github.com/loonylabs-dev/react-native-offline-sync/issues)
- [Documentation](https://github.com/loonylabs-dev/react-native-offline-sync/tree/main/docs)

## Credits

Built with:
- [WatermelonDB](https://nozbe.github.io/WatermelonDB/)
- [React Native](https://reactnative.dev/)
