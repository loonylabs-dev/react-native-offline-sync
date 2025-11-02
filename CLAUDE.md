# Claude Development Guidelines - React Native Offline Sync

## Core Principles

Read this first before every task:

- **No Monoliths** → Build for good architecture, fast builds, maintainability
- **Question Your Assumptions** → Research web & codebase when <90% confident
- **Avoid Positive Bias** → Be skeptical, challenge yourself and me for better solutions
- **Language** → German communication OK, but code/README/docs always in English
- **Context is King** → Ask instead of guessing what I want
- **Keep Things Organized** → Use folders/subfolders, not project root dumps
- **Data Integrity First** → Never lose user data

## Language Requirements

**IMPORTANT: ALL code comments, documentation, README files, commit messages, and code documentation MUST be written in ENGLISH.**

This includes:
- Code comments (inline, block, JSDoc, etc.)
- README.md files and documentation
- CHANGELOG.md
- API documentation
- Git commit messages
- Function/class documentation
- Variable names and constants
- Error messages in code
- Log messages

## 🎯 Project Overview

This is a **production-ready offline-first synchronization engine** for React Native with WatermelonDB.

**Tech Stack:**
- TypeScript (strict mode)
- WatermelonDB (local database)
- React Native 0.70+
- NetInfo (network detection)
- AsyncStorage (metadata storage)

**Use Cases:**
- Mobile apps with offline-first data
- Automatic background sync
- Conflict resolution
- Queue-based sync operations

---

## 🚨 Critical Rule: No Legacy Code During Development

### **IMPORTANT: We are in library development phase**

**Until we reach 1.0.0 stable:**

- ❌ **DO NOT keep deprecated code or functions**
- ❌ **DO NOT mark functions as `@deprecated`**
- ❌ **DO NOT maintain backwards compatibility in pre-1.0**
- ❌ **DO NOT comment out old code "just in case"**

**Instead:**

- ✅ **Delete unused code immediately**
- ✅ **Refactor aggressively**
- ✅ **Break things if needed for better design**
- ✅ **Keep the codebase clean**

**Rationale:**
We are building a library for public consumption. Clean, maintainable code is more important than backwards compatibility before 1.0. We need to move fast and iterate.

### When This Changes

Once we release 1.0.0:
1. Start using semantic versioning strictly
2. Use `@deprecated` annotations for phasing out features
3. Maintain backwards compatibility for public APIs
4. Write migration guides for breaking changes

**Until then: DELETE, don't deprecate.**

---

## 📝 Code Standards

### TypeScript - Strict Mode ALWAYS

```typescript
// ✅ GOOD - Explicit types
interface SyncPayload {
  table: string;
  operation: SyncOperation;
  recordId: string;
  data: Record<string, any>;
}

async function pushChanges(payload: SyncPayload): Promise<SyncResult> {
  // ...
}

// ❌ BAD - No any, no implicit any
async function pushChanges(payload: any) {
  // ...
}
```

### Data Integrity Standards

#### 🔒 NEVER Delete User Data Without Confirmation

```typescript
// ✅ GOOD - Soft deletes, user data preserved
async deleteRecord(record: Model) {
  await record.update((r) => {
    r.deletedAt = new Date();
  });
  // Will sync to server, data recoverable
}

// ❌ BAD - Hard delete, data lost forever
async deleteRecord(record: Model) {
  await record.destroyPermanently(); // Won't sync! Data lost!
}
```

#### Queue Persistence

```typescript
// ✅ GOOD - Operations persisted to queue
async createRecord(data: any) {
  const record = await database.write(async () => {
    return await collection.create((r) => {
      Object.assign(r, data);
    });
  });

  // Add to sync queue
  await syncEngine.queueOperation('CREATE', 'posts', record.id, data);
}

// ❌ BAD - No queue, sync fails if offline
async createRecord(data: any) {
  const record = await collection.create((r) => Object.assign(r, data));
  // Missing: queueOperation()
}
```

### Offline-First Principles

```typescript
// ✅ GOOD - Optimistic UI, background sync
async createPost(title: string, content: string) {
  // 1. Create locally immediately
  const post = await database.write(async () => {
    return await postsCollection.create((p) => {
      p.title = title;
      p.content = content;
    });
  });

  // 2. Show to user immediately
  setState({ posts: [...posts, post] });

  // 3. Sync in background
  syncEngine.sync().catch(console.error);

  return post;
}

// ❌ BAD - Wait for server, blocking UI
async createPost(title: string, content: string) {
  // 1. Send to server first (blocks!)
  const response = await apiClient.createPost({ title, content });

  // 2. Then create locally
  const post = await database.write(async () => {
    return await postsCollection.create((p) => {
      p.serverId = response.id;
      p.title = title;
      p.content = content;
    });
  });

  return post;
}
```

### Conflict Resolution

```typescript
// ✅ GOOD - Documented conflict strategy
const syncEngine = new SyncEngine({
  conflictStrategy: 'last-write-wins', // Clear strategy
  customConflictResolver: (local, server) => {
    // Custom logic if needed
    return local.priority > server.priority ? local : server;
  },
});

// Document why this strategy was chosen
/**
 * Using last-write-wins because:
 * - Most recent edit is most relevant
 * - Simple to understand for users
 * - Works well for our use case (personal notes)
 */
```

---

## 🧪 Testing Standards

### Coverage Requirements

| Component | Minimum | Target |
|-----------|---------|--------|
| Core Sync Logic | 80% | 95% |
| Queue Manager | 90% | 100% |
| Synchronizers | 80% | 90% |
| Conflict Resolution | 90% | 100% |
| Network Detection | 80% | 95% |
| Utilities | 90% | 100% |

### Test Files Organization

```
__tests__/
├── core/
│   ├── SyncEngine.test.ts
│   ├── SyncQueueManager.test.ts
│   ├── PushSynchronizer.test.ts
│   ├── PullSynchronizer.test.ts
│   └── NetworkDetector.test.ts
├── strategies/
│   └── ConflictResolver.test.ts
├── hooks/
│   ├── useSyncEngine.test.tsx
│   └── useNetworkStatus.test.tsx
├── utils/
│   ├── retry.test.ts
│   └── timestamp.test.ts
└── setup.ts
```

### Test Requirements

```typescript
// ✅ GOOD - Test data integrity scenarios
describe('SyncQueueManager', () => {
  it('should persist operations across app restarts', async () => {
    await queueManager.addToQueue('CREATE', 'posts', '123', { title: 'Test' });

    // Simulate app restart
    const newQueueManager = new SyncQueueManager(database);
    const pending = await newQueueManager.getPendingItems();

    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('CREATE');
  });

  it('should not lose data on sync failure', async () => {
    // ... test retry logic
  });
});

// ❌ BAD - Only happy path
describe('SyncQueueManager', () => {
  it('should add to queue', async () => {
    await queueManager.addToQueue('CREATE', 'posts', '123', {});
    // Missing: failure scenarios, edge cases
  });
});
```

---

## 📦 Project Structure

```
src/
├── core/
│   ├── SyncEngine.ts           # Main orchestrator
│   ├── SyncQueueManager.ts     # Queue operations
│   ├── PushSynchronizer.ts     # Push to server
│   ├── PullSynchronizer.ts     # Pull from server
│   └── NetworkDetector.ts      # Network monitoring
├── database/
│   ├── models/
│   │   ├── BaseModel.ts        # Base model with sync
│   │   └── SyncQueueItem.ts    # Queue model
│   └── schema/
│       ├── syncMetadata.ts     # Sync field definitions
│       └── syncQueueSchema.ts  # Queue table schema
├── strategies/
│   └── ConflictResolver.ts     # Conflict resolution
├── hooks/
│   ├── useSyncEngine.ts        # React hook
│   └── useNetworkStatus.ts     # Network status hook
├── components/
│   ├── OfflineBanner.tsx       # UI component
│   ├── SyncStatusBadge.tsx     # UI component
│   └── SyncRefreshControl.tsx  # UI component
├── utils/
│   ├── logger.ts               # Logging utility
│   ├── retry.ts                # Retry logic
│   └── timestamp.ts            # Timestamp helpers
├── types/
│   └── index.ts                # TypeScript types
└── index.ts                    # Public exports
```

---

## 🔌 API Design Principles

### Public API Stability

```typescript
// ✅ GOOD - Stable public API
export { SyncEngine } from './core/SyncEngine';
export { BaseModel } from './database/models/BaseModel';
export { useSyncEngine } from './hooks/useSyncEngine';
export { syncQueueTableSchema, createTableSchemaWithSync } from './database/schema';
export type { SyncEngineConfig, SyncResult, SyncOperation } from './types';

// ❌ BAD - Exposing internals
export { SyncQueueManager } from './core/SyncQueueManager'; // Internal
export { PushSynchronizer } from './core/PushSynchronizer'; // Internal
```

### Breaking Change Policy

```typescript
// Before 1.0.0: Breaking changes OK
// After 1.0.0: Breaking changes require major version bump

// ✅ GOOD - Backwards compatible addition
interface SyncEngineConfig {
  database: Database;
  tables: string[];
  // New optional field (backwards compatible)
  batchSize?: number;
}

// ❌ BAD - Breaking change (requires major bump)
interface SyncEngineConfig {
  database: Database;
  tables: string[];
  // Changed from optional to required (breaking!)
  syncInterval: number;
}
```

---

## 📖 Documentation Standards

### Code Comments

```typescript
// ✅ GOOD - JSDoc for complex logic
/**
 * Synchronize local changes with server
 *
 * This performs a two-phase sync:
 * 1. Push: Send local changes to server
 * 2. Pull: Fetch server changes and apply locally
 *
 * @returns Promise resolving to sync result with statistics
 * @throws {Error} If database is not initialized
 *
 * @example
 * ```typescript
 * const result = await syncEngine.sync();
 * console.log(`Synced ${result.stats.pushedCount} records`);
 * ```
 */
async sync(): Promise<SyncResult> {
  // ...
}

// ❌ BAD - No documentation for complex logic
async sync(): Promise<SyncResult> {
  // Complex sync logic with no explanation
  // ...
}
```

### README Requirements

- Installation with peer dependencies
- Schema setup guide
- Model requirements (BaseModel, soft deletes)
- API client implementation
- Conflict resolution strategies
- Migration guides
- TypeScript examples

---

## 🚀 Release Process

### Pre-Release Checklist

```markdown
- [ ] All tests passing (`npm test`)
- [ ] Coverage meets 80% threshold
- [ ] No console.log statements
- [ ] README.md updated
- [ ] CHANGELOG.md updated
- [ ] Migration guide (if breaking changes)
- [ ] Example app tested with WatermelonDB
- [ ] Soft delete requirement documented
- [ ] Types exported correctly
```

### WatermelonDB Compatibility

Test with multiple WatermelonDB versions:

```json
{
  "peerDependencies": {
    "@nozbe/watermelondb": ">=0.27.0 <1.0.0"
  }
}
```

Test matrix:
- WatermelonDB 0.27.x
- WatermelonDB 0.28.x
- React Native 0.70, 0.71, 0.72, 0.73

---

## 🔧 Git Workflow

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add custom conflict resolver support
fix: prevent data loss on sync queue overflow
refactor: optimize pull synchronizer performance
docs: add soft delete requirements guide
test: add SyncQueueManager integration tests
perf: reduce database queries in batch sync
```

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation update

## Data Integrity
- [ ] No data loss scenarios
- [ ] Soft deletes used (not hard deletes)
- [ ] Queue operations persisted
- [ ] Sync failures handled gracefully

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added
- [ ] Tested with offline/online transitions
- [ ] Tested conflict resolution

## Checklist
- [ ] Tests passing
- [ ] Coverage threshold met
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

---

## 🤖 AI-Assisted Development Guidelines

### When Using Claude or Other AI

```markdown
✅ DO:
- Provide context about data integrity requirements
- Ask for conflict resolution review
- Request test scenarios for offline/online transitions
- Use AI for queue management logic
- Ask for performance optimization suggestions

❌ DON'T:
- Blindly accept hard delete suggestions
- Skip sync queue persistence
- Ignore offline scenarios
- Let AI generate code without retry logic
- Accept breaking changes without migration path
```

---

## 🔒 Data Integrity Checklist

Before merging any sync-related code:

- [ ] Soft deletes used (not `destroyPermanently()`)
- [ ] Operations added to sync queue
- [ ] Queue persisted to database
- [ ] Retry logic implemented
- [ ] Offline scenarios tested
- [ ] No data loss on sync failure
- [ ] Conflicts resolved correctly
- [ ] Network errors handled gracefully

---

## ⚠️ Critical Requirements

### Soft Delete Requirement

**CRITICAL:** All synced models **MUST** use soft deletes.

```typescript
// ✅ CORRECT
class Post extends BaseModel {
  static table = 'posts';

  async delete() {
    await this.update((record) => {
      record.deletedAt = new Date();
    });
  }
}

// ❌ WRONG - Won't sync!
await post.destroyPermanently();
```

### Schema Requirements

All synced tables **MUST** have:
- `server_id` (string, nullable)
- `synced_at` (number, nullable)
- `deleted_at` (number, nullable)

Use `createTableSchemaWithSync()` helper.

---

## 📞 Support & Maintenance

### Issues

- Use GitHub Issues for bugs/features
- Provide minimal reproduction with WatermelonDB setup
- Include library version, WatermelonDB version, React Native version
- Describe sync scenario (offline/online, conflicts, etc.)

### Contributing

1. Fork repository
2. Create feature branch
3. Write tests (required! 80%+ coverage)
4. Test with WatermelonDB
5. Ensure no data loss scenarios
6. Update documentation
7. Submit PR with clear description

---

## 📝 Final Notes

### Remember:

1. **Data Integrity First** - Never lose user data
2. **Offline-First** - App must work without network
3. **Soft Deletes Only** - For all synced models
4. **Queue Everything** - All operations go through queue
5. **Type Safety** - Strict TypeScript, no `any`
6. **Test Coverage** - 80%+ minimum
7. **Documentation** - Especially data requirements
8. **English Only** - All code/docs in English

### Common Pitfalls

- ❌ Using `destroyPermanently()` - Use soft deletes!
- ❌ Skipping queue - All operations must be queued
- ❌ Ignoring offline state - Test offline scenarios
- ❌ No retry logic - Network can fail anytime
- ❌ Breaking changes - Document migrations

**Last Updated:** 2025-01-26
**Version:** 0.1.0

---

**Made with ❤️ by [LoonyLabs](https://github.com/loonylabs-dev)**
