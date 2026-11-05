import {
  authStore,
  configureCoreStorage,
  githubFileStore,
  githubProfileStore,
  type PendingMutation,
} from '@kaihuman/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('WidgetBridge', () => {
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

    const save = vi.spyOn(githubFileStore, 'saveFile').mockResolvedValue(undefined as never);
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
    expect(save).toHaveBeenCalledWith('.kh/inbox.todos.md');
    expect(container.files.get(PENDING_WIDGET_MUTATIONS_FILE)).toBe('[]');
    const after = JSON.parse(container.files.get(WIDGET_TODOS_FILE) ?? '{}');
    expect(after.items.some((i: { text: string }) => i.text === 'write plan')).toBe(false);

    expect(await bridge.reconcile()).toBe(0);
    save.mockRestore();
  });
});
