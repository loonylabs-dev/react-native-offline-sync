# Requirements & Conventions

This document describes the requirements and conventions your app must follow to use this library correctly.

## Database Schema Requirements

### 1. Sync Metadata Fields

All synced tables **MUST** include these metadata fields:

```typescript
import { createTableSchemaWithSync } from '@loonylabs/react-native-offline-sync';

const schema = appSchema({
  version: 1,
  tables: [
    createTableSchemaWithSync('posts', [
      // Your custom fields
      { name: 'title', type: 'string' },
      { name: 'content', type: 'string' },
    ]),
  ],
});
```

This adds the following required fields automatically:
- `server_id` (string, nullable) - The server-assigned ID
- `synced_at` (number, nullable) - Last sync timestamp
- `deleted_at` (number, nullable) - Soft delete timestamp

### 2. Soft Delete Requirement

**CRITICAL:** All synced models **MUST** use soft deletes (not hard deletes).

#### Why Soft Deletes?

Hard deletes remove records from the database immediately. When sync happens, there's no way to know:
- Which records were deleted locally (need to tell server)
- Which records were deleted on server (need to remove locally)

Soft deletes mark records as deleted while keeping them in the database until after successful sync.

#### Implementation

**❌ WRONG - Hard Delete (Don't do this!)**

```typescript
// This will NOT sync the deletion to the server
await post.destroyPermanently();
```

**✅ CORRECT - Soft Delete**

```typescript
import { BaseModel } from '@loonylabs/react-native-offline-sync';
import { text, date } from '@nozbe/watermelondb/decorators';

class Post extends BaseModel {
  static table = 'posts';

  @text('title') title!: string;
  @date('deleted_at') deletedAt!: Date | null;

  // Soft delete method
  async softDelete() {
    await this.update((record) => {
      record.deletedAt = new Date();
    });
  }
}

// Usage:
await post.softDelete(); // ✅ This will sync to server
```

#### BaseModel Helper

The `BaseModel` class provides built-in soft delete support:

```typescript
class Post extends BaseModel {
  static table = 'posts';
  @text('title') title!: string;
}

// BaseModel provides these properties:
post.isDeleted // true if deleted_at is set
post.deletedAt // Date | null

// Soft delete:
await post.update((record) => {
  record.deletedAt = new Date();
});
```

### 3. Server ID Management

Models have two IDs:
- **Local ID** (`id`): WatermelonDB auto-generated UUID (used locally)
- **Server ID** (`server_id`): Backend-assigned ID (used for sync)

```typescript
class Post extends BaseModel {
  static table = 'posts';

  // Inherited from BaseModel:
  // id: string (local WatermelonDB ID)
  // serverId: string | null (server ID)
  // syncedAt: Date | null
  // deletedAt: Date | null
}

// Creating a new record (before sync):
const post = await database.write(async () => {
  return await postsCollection.create((record) => {
    record.title = 'Hello World';
    // serverId is null (not synced yet)
  });
});

console.log(post.id);       // "abc-123-local-uuid"
console.log(post.serverId); // null

// After sync, serverId is populated:
console.log(post.serverId); // "550e8400-e29b-41d4-a716-446655440000"
```

### 4. Timestamps

All synced tables automatically get:
- `created_at` (WatermelonDB default)
- `updated_at` (WatermelonDB default)
- `synced_at` (library field) - Last successful sync time
- `deleted_at` (required for soft deletes)

## Model Requirements

### 1. Extend BaseModel

All synced models **MUST** extend `BaseModel`:

```typescript
import { BaseModel } from '@loonylabs/react-native-offline-sync';

class Post extends BaseModel {
  static table = 'posts';
  // ...
}
```

**Why?** `BaseModel` provides:
- Sync metadata accessors (`serverId`, `syncedAt`, `deletedAt`)
- Helper properties (`isSynced`, `hasSyncError`, `isPendingSync`)
- Type-safe sync operations

### 2. Implement toSyncPayload (Optional)

If your model has complex fields or needs transformation before syncing:

```typescript
class Post extends BaseModel {
  @text('title') title!: string;
  @json('metadata', sanitizeMetadata) metadata!: object;

  toSyncPayload(): Record<string, any> {
    return {
      title: this.title,
      metadata: JSON.stringify(this.metadata), // Transform for API
      // Don't include internal fields
    };
  }
}
```

## API Client Requirements

### 1. Push Endpoint

Your backend **MUST** implement a push endpoint:

```typescript
POST /sync/push
Content-Type: application/json

{
  "changes": [
    {
      "table": "posts",
      "operation": "CREATE",
      "localId": "abc-123",
      "serverId": null,
      "payload": {
        "title": "Hello World",
        "content": "..."
      }
    }
  ]
}

// Response:
{
  "results": [
    {
      "localId": "abc-123",
      "serverId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "success"
    }
  ]
}
```

**Required Response Fields:**
- `localId` - Echo back the local ID
- `serverId` - Server-assigned ID (for CREATE operations)
- `status` - "success" or "error"
- `error` (optional) - Error message if status is "error"

### 2. Pull Endpoint

Your backend **MUST** implement a pull endpoint:

```typescript
POST /sync/pull
Content-Type: application/json

{
  "tables": ["posts", "comments"],
  "lastPulledAt": {
    "posts": 1234567890000,
    "comments": 1234567890000
  }
}

// Response:
{
  "changes": {
    "posts": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Updated Title",
        "content": "...",
        "updated_at": 1234567890000,
        "deleted_at": null
      }
    ],
    "comments": []
  },
  "timestamp": 1234567899999
}
```

**Required Response Fields:**
- `changes` - Object with table names as keys
- `changes[table]` - Array of changed records
- `timestamp` - Server timestamp for this pull (used in next pull)

**Important:** The pull endpoint should return:
- Records created/updated since `lastPulledAt`
- Records with `deleted_at` set (soft deletes)

## Network Requirements

### 1. Authentication

The library does NOT handle authentication. Your `apiClient` must handle auth:

```typescript
const apiClient = {
  push: async (payload) => {
    const token = await getAuthToken(); // Your auth logic

    const response = await fetch('https://api.example.com/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${response.status}`);
    }

    return response.json();
  },
  pull: async (payload) => {
    // Same pattern
  },
};
```

### 2. Error Handling

Your API client should throw errors that the sync engine can retry:

```typescript
const apiClient = {
  push: async (payload) => {
    try {
      const response = await fetch(...);

      if (response.status === 401) {
        // Don't retry auth errors
        throw new Error('Unauthorized');
      }

      if (response.status >= 500) {
        // Retry server errors
        throw new Error('Server error');
      }

      return response.json();
    } catch (error) {
      // Network errors will be retried
      throw error;
    }
  },
};
```

## WatermelonDB Configuration

### 1. Sync Queue Table

You **MUST** include the sync queue table:

```typescript
import { syncQueueTableSchema } from '@loonylabs/react-native-offline-sync';

const schema = appSchema({
  version: 1,
  tables: [
    syncQueueTableSchema, // Required!
    // Your tables...
  ],
});
```

### 2. Migration

When migrating existing databases:

```typescript
import { migrationForSyncSupport } from '@loonylabs/react-native-offline-sync';

const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        // Add sync queue table
        createTable({
          name: 'sync_queue',
          columns: [
            { name: 'operation', type: 'string' },
            { name: 'table_name', type: 'string' },
            { name: 'record_id', type: 'string' },
            { name: 'payload', type: 'string' },
            { name: 'retry_count', type: 'number' },
            { name: 'error', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),

        // Add sync metadata to existing tables
        addColumns({
          table: 'posts',
          columns: [
            { name: 'server_id', type: 'string', isOptional: true },
            { name: 'synced_at', type: 'number', isOptional: true },
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
```

## Best Practices

### ✅ DO

1. **Use Soft Deletes**
   ```typescript
   await record.update((r) => { r.deletedAt = new Date(); });
   ```

2. **Extend BaseModel**
   ```typescript
   class Post extends BaseModel { ... }
   ```

3. **Filter Deleted Records in Queries**
   ```typescript
   const posts = await database.collections
     .get('posts')
     .query(Q.where('deleted_at', null))
     .fetch();
   ```

4. **Handle Sync Errors Gracefully**
   ```typescript
   const { syncStatus, error } = useSyncEngine(syncEngine);
   if (error) {
     showErrorBanner(error.message);
   }
   ```

### ❌ DON'T

1. **Don't Use Hard Deletes**
   ```typescript
   await record.destroyPermanently(); // ❌ Won't sync!
   ```

2. **Don't Modify server_id Manually**
   ```typescript
   record.serverId = 'custom-id'; // ❌ Managed by sync engine
   ```

3. **Don't Sync Without deleted_at Field**
   ```typescript
   // ❌ Table without deleted_at won't sync deletes correctly
   ```

4. **Don't Forget to Initialize**
   ```typescript
   const syncEngine = new SyncEngine({ ... });
   // ❌ Missing: await syncEngine.initialize();
   ```

## Checklist

Before using this library, ensure:

- [ ] All synced tables have `createTableSchemaWithSync()`
- [ ] All synced models extend `BaseModel`
- [ ] All synced tables have `deleted_at` field
- [ ] Soft deletes are used (not `destroyPermanently()`)
- [ ] `sync_queue` table is in schema
- [ ] Backend implements `/sync/push` endpoint
- [ ] Backend implements `/sync/pull` endpoint
- [ ] API client handles authentication
- [ ] Queries filter out `deleted_at IS NOT NULL`
- [ ] Sync engine is initialized before first sync

## Support

If you have questions about requirements:
- Check [GitHub Discussions](https://github.com/loonylabs-dev/react-native-offline-sync/discussions)
- Review [Example App](../example/)
- Open an [Issue](https://github.com/loonylabs-dev/react-native-offline-sync/issues)
