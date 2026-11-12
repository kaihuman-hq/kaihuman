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

## Widget captures (root cause, 2026-11-10)

A widget "+" cold-launches the app into the capture sheet before the first `loadTree`. Reads then
returned null and saves created files from scratch, which that `loadTree` discarded. Captures
(`QuickCaptureController`) and widget-queue replays (`WidgetBridge.reconcile`) now wait for
`repoReady()` (`repo-ready.ts`); the queue is left untouched until then.

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

- Foreground always syncs (a 304 head check is free). When the data is older than 2 min, a run
  still in flight does not count: it may be a request iOS froze while the app was suspended, so
  a fresh run is queued behind it. The banner shows "Syncing…" meanwhile; screens re-read on the
  `syncRevision` bump, so what was on screen stays until the new data is there (no blank flash).
- Leaving the foreground pushes a debounced edit at once: iOS suspends the app within seconds.
- A pull skipped because a save was in flight is retried after the outbox. A run that still
  pulled nothing is not counted as fresh (`lastSyncedAt` unchanged).

## Staleness guarantees

- Mutable reads (branch head, contents by path) bypass the HTTP cache (`cache: 'no-store'`;
  React Native's whatwg-fetch adds a `_=<time>` query, so NSURLCache cannot answer from its
  60 s cache). Trees and blobs are read by sha, which never changes.
- A cached copy is served only when the tree lists the same blob sha (`canServeFromCache`).
- Every save sends the sha it is based on. 409/422 (remote moved) → 3-way merge with the remote;
  overlapping changes → conflict banner. Nothing overwrites a newer remote.

## Background sync (iOS)

`background.ts` defines the task at module scope (`app/_layout.tsx` imports it first) and
registers it at boot when Background App Refresh is available. The `expo-background-task` config
plugin (in `app.json`) adds `UIBackgroundModes: processing` and the `BGTaskSchedulerPermittedIdentifiers`
entry. A run boots headless, pulls, opens every todo file (cache-first) and rewrites the widget
snapshot, then reloads the widget timelines. A snapshot is written only when every todo file the
tree lists is open, so a headless launch never replaces a good widget with an empty one.

iOS limits: the 15 min interval is a minimum, not a schedule. iOS runs the task when it decides
(battery, usage, network), often a few times a day, never after the user force-quits the app or
while Background App Refresh or Low Power Mode is off, and gives it about 30 s. Fresh data within
minutes needs the app in the foreground. Test on a device with Xcode's "Simulate Background Fetch"
or `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.expo.modules.backgroundtask.processing"]`.

## A sync run

1. First run for a repo: `loadTree()` (cached tree shown first). Later: `syncNow()`, which
   reads the branch head with `If-None-Match` (a 304 is free and changes nothing) and lists the
   tree only when the head moved, then reconciles changed open files (3-way merge on dirty ones).
2. Open every todo file (cache-first), replay widget mutations, then `flushOutbox()` (sha-checked
   saves; backoff in core). Pull again if step 1 was skipped by a save in flight.
3. Widget snapshot + `reloadAllTimelines()` when it changed; `rescheduleNotifications()`.
4. Bump `syncRevision` so mounted screens re-read from cache.

Writes are optimistic: the content ports update the store, persist the dirty record and return;
the outbox pushes later. A real conflict (both sides changed the same lines) is listed in
`SyncStatus.conflicts`; the banner offers "Keep mine" / "Use theirs".
