import { Logger } from '@kaihuman/core';
import { effect } from '@preact/signals';
import { shouldFullLoad } from './revalidate.js';
import { type SyncStatus, type SyncTrigger, syncRevision, syncStatus } from './status.js';

const logger = new Logger('Sync');

interface Readable<T> {
  peek(): T;
  readonly value: T;
}

/** The part of `githubFileStore` a run uses; injected so the engine is tested with fakes. */
export interface SyncStoreSlice {
  loadedRepo: Readable<string | null>;
  tree: Readable<readonly unknown[]>;
  dirtyFiles: Readable<ReadonlySet<string>>;
  fileConflicts: Readable<Readonly<Record<string, unknown>>>;
  error: Readable<string | null>;
  loadTree(): Promise<unknown>;
  syncNow(): Promise<unknown>;
  flushOutbox(): Promise<void>;
  flushPendingWrites(): Promise<void>;
  resolveConflict(path: string, resolution: 'keep_local' | 'use_remote'): void;
}

export interface SyncEngineDeps {
  store: SyncStoreSlice;
  /** Full name of the selected repository, or null. */
  currentRepo(): string | null;
  widgets: { reconcile(): Promise<unknown>; sync(): Promise<unknown> };
  reschedule(): Promise<void> | void;
  isOnline(): boolean;
  /** Asks the scheduler for a debounced 'write' run (used after a conflict decision). */
  requestWrite(): void;
  now?: () => number;
}

export interface SyncEngine {
  run(trigger: SyncTrigger): Promise<boolean>;
  resolveConflict(path: string, choice: 'keep_local' | 'use_remote'): void;
  dispose(): void;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { store } = deps;
  const now = deps.now ?? Date.now;

  const patch = (next: Partial<SyncStatus>) => {
    syncStatus.value = { ...syncStatus.peek(), ...next };
  };

  // Pending and conflicts must follow edits made between runs, not only the run's own result.
  const stopTracking = effect(() => {
    const pending = store.dirtyFiles.value.size;
    const conflicts = Object.keys(store.fileConflicts.value);
    const prev = syncStatus.peek();
    if (
      prev.pending === pending &&
      prev.conflicts.length === conflicts.length &&
      prev.conflicts.every((c, i) => c === conflicts[i])
    ) {
      return;
    }
    patch({ pending, conflicts });
  });

  // Widget and notification work must not stop the data sync that precedes it.
  const bestEffort = async (label: string, work: () => Promise<unknown> | unknown) => {
    try {
      await work();
    } catch (err) {
      logger.error(`Sync: ${label} failed`, err);
    }
  };

  // Pending edits and conflicts as one comparable value: a change means screens may differ.
  const snapshot = () =>
    JSON.stringify([
      [...store.dirtyFiles.peek()].sort(),
      Object.keys(store.fileConflicts.peek()).sort(),
    ]);

  /** Returns whether the remote side may have changed what screens show. */
  async function pull(): Promise<boolean> {
    if (shouldFullLoad(store.loadedRepo.peek(), deps.currentRepo(), store.tree.peek().length)) {
      await store.loadTree();
      // loadTree reports failures through `error` instead of throwing.
      const error = store.error.peek();
      if (error) throw new Error(error);
      return true;
    }
    return (await store.syncNow()) === 'synced';
  }

  async function run(trigger: SyncTrigger): Promise<boolean> {
    patch({ phase: 'syncing' });
    let failure: string | null = null;
    // Screens reload on every bump, and a reload can start another refresh, so only bump for
    // runs that may have changed data. A cheap 'unchanged' poll must not.
    const before = snapshot();
    let changed = false;
    try {
      if (trigger === 'write') await store.flushPendingWrites();
      changed = await pull();
      await bestEffort('widget reconcile', () => deps.widgets.reconcile());
      await store.flushOutbox();
      // Edits that are still unsent and not conflicted failed to push.
      const stuck = [...store.dirtyFiles.peek()].some((p) => !(p in store.fileConflicts.peek()));
      if (stuck && store.error.peek()) failure = store.error.peek();
      await bestEffort('widget sync', () => deps.widgets.sync());
      await bestEffort('notification reschedule', () => deps.reschedule());
    } catch (err) {
      failure = messageOf(err);
    }
    if (changed || snapshot() !== before) syncRevision.value += 1;
    const pending = store.dirtyFiles.peek().size;
    const conflicts = Object.keys(store.fileConflicts.peek());
    if (failure === null) {
      patch({ phase: 'idle', lastSyncedAt: now(), pending, conflicts, error: null });
      return true;
    }
    patch({ phase: deps.isOnline() ? 'error' : 'offline', pending, conflicts, error: failure });
    return false;
  }

  return {
    // Never throws: a throw from the scheduler's run would look like a crash to every caller.
    run: (trigger) =>
      run(trigger).catch((err) => {
        logger.error('Sync run crashed', err);
        patch({ phase: 'error', error: messageOf(err) });
        return false;
      }),
    resolveConflict(path, choice) {
      store.resolveConflict(path, choice);
      deps.requestWrite();
    },
    dispose: stopTracking,
  };
}
