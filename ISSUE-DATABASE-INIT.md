# Database Initialization Timing Issue

## Problem
`SyncQueueManager.getPendingCount()` fails with error: `TypeError: Cannot read property 'query' of null`

## Root Cause
The `SyncEngine` is instantiated with a `database` reference that may not be fully initialized when the constructor runs. When `initialize()` is called and tries to call `getPendingCount()`, the database instance is still `null`.

## Current Flow
1. App starts
2. `SyncEngine` constructor runs (database passed but may not be ready)
3. `SyncEngine.initialize()` called immediately
4. `updatePendingCount()` → `getPendingCount()` called
5. **ERROR**: `this.database` is `null` in `SyncQueueManager`

## Affected Code
- `SyncQueueManager.getPendingCount()` (line 102-110)
- `SyncEngine.initialize()` (line 93-131)
- `SyncEngine.updatePendingCount()` (called at line 118)

## Solution Options

### Option 1: Add null checks in SyncQueueManager
Add defensive null checks before accessing database:
```typescript
async getPendingCount(): Promise<number> {
  try {
    if (!this.database) {
      this.logger.warn('Database not initialized yet');
      return 0;
    }
    const syncQueueCollection = this.database.get<SyncQueueItemModel>('sync_queue');
    const count = await syncQueueCollection.query().fetchCount();
    return count;
  } catch (error) {
    this.logger.error('Failed to get pending count:', error);
    return 0;
  }
}
```

### Option 2: Validate database in SyncEngine.initialize()
Check if database is ready before proceeding:
```typescript
async initialize(): Promise<void> {
  if (!this.config.database) {
    throw new Error('Database is required for SyncEngine initialization');
  }
  // ... rest of initialization
}
```

### Option 3: Consumer responsibility (Documentation)
Document that consumers must ensure database is initialized before creating SyncEngine.

## Recommendation
**Implement Option 1** - Most defensive and user-friendly. The library should handle edge cases gracefully.

## Testing Requirements
- [ ] Unit test: SyncQueueManager with null database
- [ ] Integration test: SyncEngine initialization before database ready
- [ ] Integration test: SyncEngine initialization after database ready
