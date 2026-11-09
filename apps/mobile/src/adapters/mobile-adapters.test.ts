import {
  authStore,
  configureCoreStorage,
  githubFileStore,
  githubProfileStore,
  type PendingMutation,
} from '@kaihuman/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type KeyValueDriver, MobileStorageAdapter, type RecordDriver } from './mobile-storage.js';
import {
  InMemorySharedContainer,
  PENDING_WIDGET_MUTATIONS_FILE,
  WIDGET_TODOS_FILE,
  WidgetBridge,
} from './widget-bridge.js';

const repo = {
  id: 1,
  name: 'kb',
  full_name: 'me/kb',
  private: true,
  owner: { login: 'me', avatar_url: '' },
  default_branch: 'main',
  updated_at: '',
};

const kvDriver = (): KeyValueDriver & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

const TODOS = '# Todos\n\n- [ ] write plan\n- [>] ship phase 2\n';

describe('MobileStorageAdapter', () => {
  it('runs in memory without drivers', async () => {
    const a = new MobileStorageAdapter();
    a.setItem('k', 'v');
    expect(a.getItem('k')).toBe('v');
    await a.putRecord('trees', 'x', [1]);
    expect(await a.getRecord('trees', 'x')).toEqual([1]);
    const m: PendingMutation = {
      id: 'm',
      repoFullName: 'me/kb',
      path: 'a',
      content: 'c',
      timestamp: 1,
    };
    await a.putPendingMutation(m);
    expect(await a.listPendingMutations()).toEqual([m]);
    await a.deletePendingMutation('m');
    expect(await a.listPendingMutations()).toEqual([]);
  });

  it('routes tokens to secure storage, mirrors them, and queues mutations in the record driver', async () => {
    const secure = kvDriver();
    const kv = kvDriver();
    const rows = new Map<string, unknown>();
    const records: RecordDriver = {
      get: async (s, k) => rows.get(`${s}:${k}`) as never,
      put: async (s, k, v) => void rows.set(`${s}:${k}`, v),
      delete: async (s, k) => void rows.delete(`${s}:${k}`),
      list: async (s) =>
        [...rows].filter(([k]) => k.startsWith(`${s}:`)).map(([, v]) => v as never),
    };
    const mirror = vi.fn();
    const a = new MobileStorageAdapter({ secure, kv, records, mirror });

    a.setItem('lifeos_gh_token', 'gho_x');
    a.setItem('other', 'o');
    expect(secure.map.get('lifeos_gh_token')).toBe('gho_x');
    expect(kv.map.has('lifeos_gh_token')).toBe(false);
    expect(kv.map.get('other')).toBe('o');
    expect(mirror).toHaveBeenCalledWith('lifeos_gh_token', 'gho_x');
    expect(mirror).toHaveBeenCalledTimes(1);
    a.removeItem('lifeos_gh_token');
    expect(mirror).toHaveBeenLastCalledWith('lifeos_gh_token', null);

    await a.putRecord('auth', 'user', { login: 'me' });
    expect(await a.getRecord('auth', 'user')).toEqual({ login: 'me' });
    expect(rows.size).toBe(0);

    await a.putPendingMutation({
      id: 'b',
      repoFullName: 'r',
      path: 'p',
      content: '',
      timestamp: 2,
    });
    await a.putPendingMutation({
      id: 'a',
      repoFullName: 'r',
      path: 'p',
      content: '',
      timestamp: 1,
    });
    expect((await a.listPendingMutations()).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('persists the auth token through core', async () => {
    const secure = kvDriver();
    configureCoreStorage(new MobileStorageAdapter({ secure }));
    authStore.token.value = 'gho_core';
    await vi.waitFor(() => expect(secure.map.get('lifeos_gh_token')).toBe('gho_core'));
  });
});

/** A save that succeeds: clears the dirty flag the way a real commit does. */
const mockSave = () =>
  vi.spyOn(githubFileStore, 'saveFile').mockImplementation(async () => {
    githubFileStore.dirtyFiles.value = new Set();
  });

const HABIT = '.kh/run.habit.csv';

describe('WidgetBridge', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    configureCoreStorage(new MobileStorageAdapter());
    githubProfileStore.currentRepo.value = repo;
    githubFileStore.openFiles.value = {
      '.kh/inbox.todos.md': { content: TODOS, sha: 's1' },
      'notes.md': { content: 'x', sha: 'n' },
    };
  });

  it('writes the snapshot, reloads timelines, and skips unchanged syncs', async () => {
    const container = new InMemorySharedContainer();
    const bridge = new WidgetBridge(container);
    const stop = bridge.start();
    await bridge.sync();

    const snap = JSON.parse(container.files.get(WIDGET_TODOS_FILE) ?? '{}');
    expect(snap.repoFullName).toBe('me/kb');
    expect(snap.counts).toMatchObject({ inbox: 1, inProgress: 1 });
    expect(Object.keys(snap.files)).toEqual(['.kh/inbox.todos.md']);
    const reloads = container.reloads;
    expect(reloads).toBeGreaterThan(0);

    await bridge.sync();
    expect(container.reloads).toBe(reloads);

    githubFileStore.openFiles.value = {
      ...githubFileStore.openFiles.value,
      '.kh/inbox.todos.md': { content: `${TODOS}- [ ] new\n`, sha: 's2' },
    };
    await bridge.sync();
    expect(container.reloads).toBeGreaterThan(reloads);
    stop();
  });

  it('replays a widget toggle into githubFileStore', async () => {
    const container = new InMemorySharedContainer();
    const bridge = new WidgetBridge(container);
    await bridge.sync();
    const snap = JSON.parse(container.files.get(WIDGET_TODOS_FILE) ?? '{}');
    const item = snap.items.find((i: { text: string }) => i.text === 'write plan');

    const save = mockSave();
    const flush = vi.spyOn(githubFileStore, 'flushPendingWrites').mockResolvedValue(undefined);
    await container.write(
      PENDING_WIDGET_MUTATIONS_FILE,
      JSON.stringify([
        { itemId: item.id, timestamp: 1 },
        { itemId: 'missing#9', timestamp: 2 },
      ]),
    );

    expect(await bridge.reconcile()).toBe(1);
    expect(githubFileStore.openFiles.value['.kh/inbox.todos.md']?.content).toContain(
      '- [x] write plan',
    );
    // Optimistic: persisted locally now, pushed by the outbox in the sync run.
    expect(flush).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(container.files.get(PENDING_WIDGET_MUTATIONS_FILE)).toBe('[]');
    const after = JSON.parse(container.files.get(WIDGET_TODOS_FILE) ?? '{}');
    expect(after.items.some((i: { text: string }) => i.text === 'write plan')).toBe(false);

    expect(await bridge.reconcile()).toBe(0);
    save.mockRestore();
  });
  const queue = async (container: InMemorySharedContainer, entries: unknown) =>
    container.write(PENDING_WIDGET_MUTATIONS_FILE, JSON.stringify(entries));
  const inbox = () => githubFileStore.openFiles.value['.kh/inbox.todos.md']?.content ?? '';

  it('replays a move to in-progress and back to backlog in timestamp order', async () => {
    const container = new InMemorySharedContainer();
    const bridge = new WidgetBridge(container);
    mockSave();
    const id = '.kh/inbox.todos.md#0';
    await queue(container, [
      { kind: 'move', itemId: id, status: 'backlog', timestamp: 3 },
      { kind: 'move', itemId: id, status: 'in-progress', timestamp: 2 },
    ]);
    // Applied oldest first: backlog -> in-progress, then back to backlog.
    expect(await bridge.reconcile()).toBe(2);
    expect(inbox()).toContain('- [ ] write plan');
  });

  it('treats entries without kind (v1 and Android) as toggles', async () => {
    const container = new InMemorySharedContainer();
    mockSave();
    await queue(container, [{ itemId: '.kh/inbox.todos.md#1', timestamp: 1 }]);
    expect(await new WidgetBridge(container).reconcile()).toBe(1);
    expect(inbox()).toContain('- [x] ship phase 2');
  });

  it('appends a capture to the current inbox content, not the widget copy', async () => {
    const container = new InMemorySharedContainer();
    mockSave();
    githubFileStore.updateFileContent('.kh/inbox.todos.md', `${TODOS}- [ ] edited meanwhile\n`);
    await queue(container, [{ kind: 'capture', text: 'buy milk', timestamp: 1 }]);
    expect(await new WidgetBridge(container).reconcile()).toBe(1);
    expect(inbox()).toContain('edited meanwhile');
    expect(inbox()).toContain('- [ ] buy milk');
  });

  it('replays several queued captures oldest first, each once', async () => {
    const container = new InMemorySharedContainer();
    mockSave();
    await queue(container, [
      { kind: 'capture', text: 'second', timestamp: 2 },
      { kind: 'capture', text: 'first', timestamp: 1 },
      { kind: 'capture', text: '', timestamp: 3 },
    ]);
    const bridge = new WidgetBridge(container);
    expect(await bridge.reconcile()).toBe(2);
    expect(inbox().indexOf('- [ ] first')).toBeLessThan(inbox().indexOf('- [ ] second'));
    expect(container.files.get(PENDING_WIDGET_MUTATIONS_FILE)).toBe('[]');
    expect(await bridge.reconcile()).toBe(0);
    expect(inbox().match(/- \[ \] first/g)).toHaveLength(1);
  });

  it('skips a capture the widget already committed with a later push', async () => {
    const container = new InMemorySharedContainer();
    githubFileStore.openFiles.value = {
      '.kh/inbox.todos.md': { content: `${TODOS}- [ ] buy milk\n`, sha: 's2' },
    };
    await queue(container, [{ kind: 'capture', text: 'buy milk', timestamp: 1 }]);
    expect(await new WidgetBridge(container).reconcile()).toBe(0);
    expect(inbox().match(/buy milk/g)).toHaveLength(1);
  });

  it('creates the inbox for a capture when it does not exist', async () => {
    const container = new InMemorySharedContainer();
    githubFileStore.openFiles.value = {};
    const create = vi.spyOn(githubFileStore, 'createFile').mockImplementation(async (p, c) => {
      githubFileStore.openFiles.value = { [p]: { content: c, sha: '' } };
    });
    await queue(container, [{ kind: 'capture', text: 'first', timestamp: 1 }]);
    expect(await new WidgetBridge(container).reconcile()).toBe(1);
    expect(create).toHaveBeenCalledWith(
      '.kh/inbox.todos.md',
      expect.stringContaining('- [ ] first'),
    );
  });

  it('checks in a habit on the current file and skips an already checked day', async () => {
    const container = new InMemorySharedContainer();
    mockSave();
    githubFileStore.openFiles.value = {
      ...githubFileStore.openFiles.value,
      [HABIT]: { content: 'iso date;goal reached\n2026-06-09;x', sha: 'h1' },
    };
    await queue(container, [
      { kind: 'habit', path: HABIT, date: '2026-06-10', timestamp: 1 },
      { kind: 'habit', path: HABIT, date: '2026-06-10', timestamp: 2 },
      { kind: 'habit', path: '.kh/missing.habit.csv', date: '2026-06-10', timestamp: 3 },
    ]);
    expect(await new WidgetBridge(container).reconcile()).toBe(1);
    expect(githubFileStore.openFiles.value[HABIT]?.content).toBe(
      'iso date;goal reached\n2026-06-09;x\n2026-06-10;x',
    );
  });

  it('skips malformed entries and malformed JSON', async () => {
    const container = new InMemorySharedContainer();
    const save = mockSave();
    await queue(container, [
      null,
      'x',
      { kind: 'move', itemId: '.kh/inbox.todos.md#0', status: 'done', timestamp: 1 },
      { kind: 'capture', timestamp: 1 },
      { kind: 'wat', timestamp: 1 },
      { itemId: '.kh/inbox.todos.md#0' },
    ]);
    expect(await new WidgetBridge(container).reconcile()).toBe(0);
    expect(save).not.toHaveBeenCalled();
    await container.write(PENDING_WIDGET_MUTATIONS_FILE, '{not json');
    expect(await new WidgetBridge(container).reconcile()).toBe(0);
    expect(container.files.get(PENDING_WIDGET_MUTATIONS_FILE)).toBe('[]');
  });

  it('puts habits, wiki cards and the raw count in the snapshot', async () => {
    const container = new InMemorySharedContainer();
    githubFileStore.openFiles.value = {
      ...githubFileStore.openFiles.value,
      [HABIT]: { content: 'iso date;goal reached', sha: 'h' },
      '.kh/wiki/a.md': { content: '# A\n\nbody', sha: 'w' },
      '.kh/raw/1.md': { content: 'x', sha: 'r' },
    };
    await new WidgetBridge(container).sync();
    const snap = JSON.parse(container.files.get(WIDGET_TODOS_FILE) ?? '{}');
    expect(snap.counts.knowledgeInbox).toBe(1);
    expect(snap.habits[0]).toMatchObject({ path: HABIT, name: 'Run', doneToday: false });
    expect(snap.cards[0]).toMatchObject({ path: '.kh/wiki/a.md', title: 'A' });
    expect(Object.keys(snap.files)).toEqual(['.kh/inbox.todos.md']);
  });
});
