# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-02

### Added
- Initial release
- Core sync engine with push/pull synchronization
- Sync queue manager for offline operations
- Network detection with auto-sync on reconnection
- Background sync with configurable intervals
- Conflict resolution strategies (Last-Write-Wins, Server-Wins, Client-Wins, Custom)
- Exponential backoff retry logic
- WatermelonDB integration
  - Schema helpers for sync metadata
  - BaseModel for syncable models
  - SyncQueueItem model
- React hooks
  - `useSyncEngine` - Main sync hook
  - `useNetworkStatus` - Network status monitoring
  - `useOptimisticUpdate` - Optimistic UI updates
- UI components
  - `SyncStatusBadge` - Visual sync status indicator
  - `OfflineBanner` - Offline warning banner
  - `SyncRefreshControl` - Pull-to-refresh with sync
- TypeScript support with full type definitions
- Comprehensive test suite
- Documentation and examples

### Technical Details
- Framework-agnostic core (React optional)
- Observable sync status
- Batch operations support
- Debug logging
- Production-ready error handling
