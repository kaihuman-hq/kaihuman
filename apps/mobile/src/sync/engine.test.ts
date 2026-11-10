import { signal } from '@preact/signals';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncEngine, type SyncStoreSlice } from './engine.js';
import { initialSyncStatus, syncRevision, syncStatus } from './status.js';

/** In-memory stand-in for githubFileStore: one dirty file whose push fails until `online`. */
const makeStore = () => {
  const state = {
    pushOk: true,
    loadFails: false,
    syncThrows: false,
    syncOutcome: 'synced' as string,
    order: [] as string[],
  };
  const dirtyFiles = signal<ReadonlySet<string>>(new Set());
  const fileConflicts = signal<Readonly<Record<string, unknown>>>({});
  const error = signal<string | null>(null);
  const loadedRepo = signal<string | null>(null);
  const tree = signal<readonly unknown[]>([]);
  const store: SyncStoreSlice = {
    loadedRepo,
    tree,
    dirtyFiles,
    fileConflicts,
    error,
    async loadTree() {
      state.order.push('loadTree');
      if (state.loadFails) {
        error.value = 'boom';
        return;
      }
      loadedRepo.value = 'o/r';
      tree.value = [{ path: 'a.md' }];
    },
    async syncNow() {
      state.order.push('syncNow');
      if (state.syncThrows) throw new Error('network down');
      return state.syncOutcome;
    },
    async flushOutbox() {
      state.order.push('flushOutbox');
      if (dirtyFiles.value.size === 0) return;
      if (!state.pushOk) {
        error.value = 'offline';
        return;
      }
      error.value = null;
      // Like the real outbox, conflicted files are skipped and stay dirty.
      dirtyFiles.value = new Set([...dirtyFiles.value].filter((p) => p in fileConflicts.value));
    },
    async flushPendingWrites() {
      state.order.push('flushPendingWrites');
    },
    resolveConflict(path, choice) {
      state.order.push(`resolve:${path}:${choice}`);
      fileConflicts.value = {};
      dirtyFiles.value = choice === 'keep_local' ? new Set([path]) : new Set();
    },
  };
  return { store, state, dirtyFiles, fileConflicts, loadedRepo, tree };
};

const setup = (overrides: Partial<Parameters<typeof createSyncEngine>[0]> = {}) => {
  const fake = makeStore();
  const widgets = {
    reconcile: vi.fn(async () => {
      fake.state.order.push('reconcile');
    }),
    sync: vi.fn(async () => {
      fake.state.order.push('widgetSync');
    }),
  };
  const reschedule = vi.fn(async () => {
    fake.state.order.push('reschedule');
  });
  const requestWrite = vi.fn();
  const engine = createSyncEngine({
    store: fake.store,
    currentRepo: () => 'o/r',
    widgets,
    reschedule,
    isOnline: () => true,
    requestWrite,
    now: () => 42,
    ...overrides,
  });
  return { ...fake, engine, widgets, reschedule, requestWrite };
};

beforeEach(() => {
  syncStatus.value = initialSyncStatus;
  syncRevision.value = 0;
});

describe('run steps', () => {
  it('loads the tree first, then syncs, in the README order', async () => {
    const t = setup();
    expect(await t.engine.run('launch')).toBe(true);
    expect(await t.engine.run('poll')).toBe(true);
    expect(t.state.order).toEqual([
      'loadTree',
      'reconcile',
      'flushOutbox',
      'widgetSync',
      'reschedule',
      'syncNow',
      'reconcile',
      'flushOutbox',
      'widgetSync',
      'reschedule',
    ]);
    t.engine.dispose();
  });

  it('flushes pending writes before syncing on a write trigger', async () => {
    const t = setup();
    await t.engine.run('launch');
    t.state.order.length = 0;
    await t.engine.run('write');
    expect(t.state.order.slice(0, 2)).toEqual(['flushPendingWrites', 'syncNow']);
    t.engine.dispose();
  });

  it('bumps the revision and records the success time', async () => {
    const t = setup();
    await t.engine.run('pull');
    expect(syncRevision.value).toBe(1);
    expect(syncStatus.value).toMatchObject({ phase: 'idle', lastSyncedAt: 42, error: null });
    t.engine.dispose();
  });

  it('shows syncing while a run is in flight', async () => {
    const t = setup();
    let release = () => {};
    t.widgets.reconcile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const p = t.engine.run('pull');
    await vi.waitFor(() => expect(t.widgets.reconcile).toHaveBeenCalled());
    expect(syncStatus.value.phase).toBe('syncing');
    release();
    await p;
    expect(syncStatus.value.phase).toBe('idle');
    t.engine.dispose();
  });
});

describe('revision bumps', () => {
  it('bumps for a full load and for a synced head, not for unchanged or skipped', async () => {
    const t = setup();
    await t.engine.run('launch');
    expect(syncRevision.value).toBe(1);
    await t.engine.run('poll');
    expect(syncRevision.value).toBe(2);
    t.state.syncOutcome = 'unchanged';
    await t.engine.run('poll');
    t.state.syncOutcome = 'skipped';
    await t.engine.run('poll');
    expect(syncRevision.value).toBe(2);
    t.engine.dispose();
  });

  it('bumps when the outbox pushed something', async () => {
    const t = setup();
    await t.engine.run('launch');
    t.state.syncOutcome = 'unchanged';
    const before = syncRevision.value;
    t.dirtyFiles.value = new Set(['a.md']);
    await t.engine.run('write');
    expect(t.dirtyFiles.value.size).toBe(0);
    expect(syncRevision.value).toBe(before + 1);
    t.engine.dispose();
  });

  it('bumps when a conflict appears during the run', async () => {
    const t = setup();
    await t.engine.run('launch');
    t.state.syncOutcome = 'unchanged';
    const before = syncRevision.value;
    t.widgets.reconcile.mockImplementation(async () => {
      t.fileConflicts.value = { 'a.md': {} };
    });
    await t.engine.run('poll');
    expect(syncRevision.value).toBe(before + 1);
    t.engine.dispose();
  });
});

describe('failures', () => {
  it('returns false with an error status and never throws', async () => {
    const t = setup();
    await t.engine.run('launch');
    t.state.syncThrows = true;
    await expect(t.engine.run('poll')).resolves.toBe(false);
    expect(syncStatus.value).toMatchObject({ phase: 'error', error: 'network down' });
    expect(syncStatus.value.lastSyncedAt).toBe(42);
    expect(syncRevision.value).toBe(1);
    t.engine.dispose();
  });

  it('a failed first load reports the store error', async () => {
    const t = setup();
    t.state.loadFails = true;
    expect(await t.engine.run('launch')).toBe(false);
    expect(syncStatus.value.error).toBe('boom');
    t.engine.dispose();
  });

  it('reports offline instead of error when the network is down', async () => {
    const t = setup({ isOnline: () => false });
    await t.engine.run('launch');
    t.state.syncThrows = true;
    await t.engine.run('background');
    expect(syncStatus.value.phase).toBe('offline');
    t.engine.dispose();
  });

  it('a throwing store call, widgets or reschedule do not escape', async () => {
    const t = setup();
    t.widgets.sync.mockRejectedValue(new Error('widget'));
    t.reschedule.mockRejectedValue(new Error('notif'));
    t.widgets.reconcile.mockRejectedValue(new Error('recon'));
    await expect(t.engine.run('launch')).resolves.toBe(true);
    t.engine.dispose();
  });

  it('recovers: the next successful run clears the error', async () => {
    const t = setup();
    await t.engine.run('launch');
    t.state.syncThrows = true;
    await t.engine.run('poll');
    t.state.syncThrows = false;
    await t.engine.run('poll');
    expect(syncStatus.value).toMatchObject({ phase: 'idle', error: null });
    t.engine.dispose();
  });
});

describe('offline queue', () => {
  it('keeps the edit pending while the push fails, then flushes it on retry', async () => {
    const t = setup();
    await t.engine.run('launch');
    t.state.pushOk = false;
    t.dirtyFiles.value = new Set(['a.md']);
    expect(syncStatus.value.pending).toBe(1);

    expect(await t.engine.run('write')).toBe(false);
    expect(syncStatus.value).toMatchObject({ pending: 1, phase: 'error', error: 'offline' });

    t.state.pushOk = true;
    expect(await t.engine.run('online')).toBe(true);
    expect(syncStatus.value).toMatchObject({ pending: 0, phase: 'idle', error: null });
    t.engine.dispose();
  });

  it('pending follows edits between runs', () => {
    const t = setup();
    t.dirtyFiles.value = new Set(['a.md', 'b.md']);
    expect(syncStatus.value.pending).toBe(2);
    t.dirtyFiles.value = new Set();
    expect(syncStatus.value.pending).toBe(0);
    t.engine.dispose();
  });
});

describe('conflicts', () => {
  it('surfaces conflicting paths without failing the run', async () => {
    const t = setup();
    await t.engine.run('launch');
    t.dirtyFiles.value = new Set(['a.md']);
    t.fileConflicts.value = { 'a.md': { remoteSha: 'x' } };
    expect(syncStatus.value.conflicts).toEqual(['a.md']);
    expect(await t.engine.run('poll')).toBe(true);
    expect(syncStatus.value).toMatchObject({ conflicts: ['a.md'], pending: 1, phase: 'idle' });
    t.engine.dispose();
  });

  it('resolving calls the store and asks for a write flush', async () => {
    const t = setup();
    t.dirtyFiles.value = new Set(['a.md']);
    t.fileConflicts.value = { 'a.md': {} };
    t.engine.resolveConflict('a.md', 'keep_local');
    expect(t.state.order).toContain('resolve:a.md:keep_local');
    expect(t.requestWrite).toHaveBeenCalledTimes(1);
    expect(syncStatus.value.conflicts).toEqual([]);
    expect(syncStatus.value.pending).toBe(1);
    t.engine.dispose();
  });
});

describe('401 recovery', () => {
  const badCredentials = (t: ReturnType<typeof setup>, times: number) => {
    let left = times;
    t.store.syncNow = async () => {
      if (left-- > 0) throw new Error('Bad credentials - https://docs.github.com/rest');
      return 'synced';
    };
  };

  it('retries once and shows no banner when the token turns out to be fine', async () => {
    // Regression: one rejected request left "Bad credentials" on screen for a valid session.
    const recoverAuth = vi.fn(async () => 'valid' as const);
    const t = setup({ recoverAuth });
    await t.engine.run('launch');
    badCredentials(t, 1);
    expect(await t.engine.run('poll')).toBe(true);
    expect(recoverAuth).toHaveBeenCalledOnce();
    expect(syncStatus.value).toMatchObject({ phase: 'idle', error: null });
    t.engine.dispose();
  });

  it('clears the banner when the session had to end', async () => {
    const t = setup({ recoverAuth: async () => 'signed-out' });
    await t.engine.run('launch');
    badCredentials(t, 5);
    expect(await t.engine.run('poll')).toBe(false);
    expect(syncStatus.value).toMatchObject({ phase: 'idle', error: null });
    t.engine.dispose();
  });

  it('leaves other failures alone', async () => {
    const recoverAuth = vi.fn(async () => 'valid' as const);
    const t = setup({ recoverAuth });
    await t.engine.run('launch');
    t.state.syncThrows = true;
    expect(await t.engine.run('poll')).toBe(false);
    expect(recoverAuth).not.toHaveBeenCalled();
    expect(syncStatus.value.error).toBe('network down');
    t.engine.dispose();
  });
});
