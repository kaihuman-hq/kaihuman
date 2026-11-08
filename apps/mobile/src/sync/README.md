# Mobile sync

How the app keeps GitHub data fresh. Screens import from `src/sync/index.ts` only.

## Why nothing refreshed (root cause, 2026-11-08)

1. **No triggers.** The console calls `installAutoSync` (DOM `visibilitychange`/`focus`/`online`
   events). The mobile app never called it or any AppState equivalent, so `syncNow()` and
   `flushOutbox()` never ran. Data changed only on a screen mount or a manual pull.
2. **No persistent cache.** `MobileStorageAdapter` was never installed, so core fell back to
   memory: the tree, file cache, dirty edits and the selected repo were lost on every launch.
   There was nothing to show "instantly" and unsent edits could be lost when iOS killed the app.
3. **Views snapshot data.** Screens copy file contents into React state / mutable controllers
   on mount and never re-read when `githubFileStore` changed.
4. **Every read hit the network.** `githubContentFiles.read()` called `openFile()`, one GET per
   file per load, even when the tree said the file had not changed.

## Public API (stable; other sessions call it)

```ts
import {
  refreshAll,        // (opts?: { reason?: SyncTrigger }) => Promise<void>; never throws
  notifyLocalWrite,  // () => void; call after any local write (the content ports do it)
  useRefresh,        // () => { refreshing: boolean; onRefresh: () => void } for RefreshControl
  useSyncRevision,   // () => number; put in a load effect's deps to re-read after a sync
  useFocusRefresh,   // () => void; in a tab screen: refreshes on focus when data is > 30 s old
  useSyncStatus,     // () => SyncStatus
  SyncStatusBanner,  // <SyncStatusBanner /> subtle status line + error/conflict banner
  setRescheduleNotifications, // (fn: () => Promise<void> | void) => void; E3 hook point
} from '../sync/index.js';
```

- Pull-to-refresh: `const { refreshing, onRefresh } = useRefresh();` then
  `<Screen refreshing={refreshing} onRefresh={onRefresh}>`. It forces a sync, fires a light
  haptic and keeps `refreshing` true only while that sync runs.
- Re-reading after background syncs: `const rev = useSyncRevision();` and add `rev` to the
  deps of the effect that loads the screen's data. Reads are cache-first, so this is cheap.

## Triggers

`launch`, `foreground` (AppState active), `focus` (tab focus, only when stale > 30 s), `pull`
(always), `poll` (60 s while active; doubles on failure up to 10 min; paused when offline, in
the background or in Low Power Mode), `write` (debounced 1.5 s after a local write), `online`
(offline → online), `background` (expo-background-task, ~15 min minimum, OS-scheduled).

## A sync run

1. First run for a repo: `loadTree()` (cached tree shown first). Later: `syncNow()`, which
   reads the branch head with `If-None-Match` (a 304 is free and changes nothing) and lists the
   tree only when the head moved, then reconciles changed open files (3-way merge on dirty ones).
2. Replay widget mutations, then `flushOutbox()` (sha-checked saves; backoff in core).
3. Widget snapshot + `reloadAllTimelines()` when it changed; `rescheduleNotifications()`.
4. Bump `syncRevision` so mounted screens re-read from cache.

Writes are optimistic: the content ports update the store, persist the dirty record and return;
the outbox pushes later. A real conflict (both sides changed the same lines) is listed in
`SyncStatus.conflicts`; the banner offers "Keep mine" / "Use theirs".
