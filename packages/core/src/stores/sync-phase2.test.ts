import '../db.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../services/conflict.js';
import type { InMemoryGithubService } from '../services/github.service.memory.js';
import { openLifeOsDb } from './idb-test-helper.js';

vi.mock('../services/github.service.js', async () => {
  const { InMemoryGithubService } = await import('../services/github.service.memory.js');
  return { githubService: new InMemoryGithubService() };
});

import { githubService } from '../services/github.service.js';
import { installAutoSync } from '../sync/auto-sync.js';
import { GithubFileStore } from './github-file.store.js';
import { githubProfileStore } from './github-profile.store.js';

const remote = githubService as unknown as InMemoryGithubService;
const FILE = 'notes.md';
const V0 = 'a\nb\nc\nd\ne\n';

const stores: GithubFileStore[] = [];
const device = () => {
  const s = new GithubFileStore();
  stores.push(s);
  return s;
};
const remoteText = async (path = FILE) => (await remote.getFileContent('o', 'r', path)).content;
/** Commits `content` as another device would, against the current remote sha. */
const pushRemote = async (content: string, path = FILE) => {
  const { sha } = await remote.getFileContent('o', 'r', path);
  await remote.saveFile('o', 'r', path, content, 'other device', sha);
};
const clearIdb = async () => {
  const db = await openLifeOsDb();
  await db.clear('files');
  await db.clear('trees');
  db.close();
};

beforeEach(async () => {
  githubProfileStore.currentRepo.value = {
    full_name: 'o/r',
    name: 'r',
    owner: { login: 'o' },
    default_branch: 'main',
  } as never;
  remote.load({ [FILE]: V0 }, []);
  await clearIdb();
});

afterEach(async () => {
  for (const s of stores.splice(0)) await s.flushPendingWrites();
  await clearIdb();
  vi.restoreAllMocks();
});

describe('phase 2, cause 2: syncNow', () => {
  it('picks up a file another device added and refreshes a clean open file', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    await pushRemote('A\nb\nc\nd\ne\n');
    await remote.saveFile('o', 'r', 'new.md', 'hi', 'other device');

    expect(await a.syncNow()).toBe('synced');
    expect(a.tree.value.some((t) => t.path === 'new.md')).toBe(true);
    expect(a.openFiles.value[FILE]?.content).toBe('A\nb\nc\nd\ne\n');
    expect(a.dirtyFiles.value.has(FILE)).toBe(false);
  });

  it('merges a dirty open file with a non-overlapping remote edit and keeps it dirty', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    a.updateFileContent(FILE, 'a\nb\nc\nd\nE\n');
    await pushRemote('A\nb\nc\nd\ne\n');

    expect(await a.syncNow()).toBe('synced');
    expect(a.openFiles.value[FILE]?.content).toBe('A\nb\nc\nd\nE\n');
    expect(a.dirtyFiles.value.has(FILE)).toBe(true);
    expect(a.fileConflicts.value).toEqual({});
  });

  it('is unchanged, without fetching the tree, while the head has not moved', async () => {
    const a = device();
    await a.loadTree();
    const spy = vi.spyOn(remote, 'fetchRepoTree');
    expect(await a.syncNow()).toBe('unchanged');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shares one run between concurrent calls', async () => {
    const a = device();
    await a.loadTree();
    await pushRemote('A\nb\nc\nd\ne\n');
    const spy = vi.spyOn(remote, 'fetchRepoTree');
    const [x, y] = await Promise.all([a.syncNow(), a.syncNow()]);
    expect([x, y]).toEqual(['synced', 'synced']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is skipped while a save is in flight', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    a.updateFileContent(FILE, 'x\n');
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = remote.saveFile.bind(remote);
    vi.spyOn(remote, 'saveFile').mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    const saving = a.saveFile(FILE);
    expect(await a.syncNow()).toBe('skipped');
    release();
    await saving;
  });

  it('syncs when the tab becomes visible again (installAutoSync)', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    await pushRemote('A\nb\nc\nd\ne\n');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const dispose = installAutoSync(a, { intervalMs: 10_000_000 });
    try {
      // The startup run already synced; wait for it, then repeat via the event.
      await vi.waitFor(() => expect(a.openFiles.value[FILE]?.content).toBe('A\nb\nc\nd\ne\n'));
      await pushRemote('A\nb\nc\nd\nZ\n');
      await new Promise((r) => setTimeout(r, 2100)); // past the 2 s throttle
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.waitFor(() => expect(a.openFiles.value[FILE]?.content).toBe('A\nb\nc\nd\nZ\n'));
    } finally {
      dispose();
    }
  });
});

describe('phase 2, cause 2: ensureFresh', () => {
  it('refreshes a stale open file once and does not refetch on repeated calls', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    await pushRemote('A\nb\nc\nd\ne\n');
    await a.loadTree(); // tree now lists the new sha; the open copy is still old
    const blobs = vi.spyOn(remote, 'getBlobBytes');

    await a.ensureFresh(FILE);
    expect(a.openFiles.value[FILE]?.content).toBe('A\nb\nc\nd\ne\n');
    await a.ensureFresh(FILE);
    await a.ensureFresh(FILE);
    expect(blobs).toHaveBeenCalledTimes(1);
  });

  it('opens a file that is not open yet', async () => {
    const a = device();
    await a.loadTree();
    await a.ensureFresh(FILE);
    expect(a.openFiles.value[FILE]?.content).toBe(V0);
  });
});

describe('phase 2, cause 5: outbox', () => {
  /** An edit whose save failed offline, persisted like a real session would have. */
  const failOffline = async (a: GithubFileStore, content: string) => {
    await a.openFile(FILE);
    a.updateFileContent(FILE, content);
    vi.spyOn(remote, 'saveFile').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await a.saveFile(FILE);
    await a.flushPendingWrites();
  };

  it('keeps a failed save dirty and counts it as unsynced', async () => {
    const a = device();
    await failOffline(a, 'a\nb\nc\nd\nE\n');
    expect(a.dirtyFiles.value.has(FILE)).toBe(true);
    expect(a.unsyncedCount.value).toBe(1);
    expect(await remoteText()).toBe(V0);
  });

  it('replays the dirty file after a reload', async () => {
    await failOffline(device(), 'a\nb\nc\nd\nE\n');
    const reloaded = device();
    expect(reloaded.unsyncedCount.value).toBe(0);
    await reloaded.flushOutbox();
    expect(await remoteText()).toBe('a\nb\nc\nd\nE\n');
    expect(reloaded.unsyncedCount.value).toBe(0);
  });

  it('merges with a remote that changed meanwhile instead of overwriting it', async () => {
    await failOffline(device(), 'a\nb\nc\nd\nE\n');
    await pushRemote('A\nb\nc\nd\ne\n');
    const reloaded = device();
    await reloaded.flushOutbox();
    expect(await remoteText()).toBe('A\nb\nc\nd\nE\n');
  });

  it('schedules a backoff retry after a failure and stops once it succeeds', async () => {
    const orig = globalThis.setTimeout;
    const delays: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === 2000 || ms === 4000) {
        delays.push(ms);
        return 1 as never;
      }
      return orig(fn, ms);
    }) as never);
    const a = device();
    await a.openFile(FILE);
    a.updateFileContent(FILE, 'x\n');
    vi.spyOn(remote, 'saveFile').mockRejectedValue(new TypeError('Failed to fetch'));
    await a.flushOutbox();
    expect(delays).toEqual([2000]);
    await a.flushOutbox(); // the timer is already pending: no second one
    expect(delays).toEqual([2000]);
  });
});

describe('phase 2, cause 6: atomic commits', () => {
  it('renames in a single commit against the head it read', async () => {
    const a = device();
    await a.loadTree();
    const commit = vi.spyOn(remote, 'commitFiles');
    await a.renameFile(FILE, 'moved.md');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[3]).toEqual({ 'moved.md': V0, [FILE]: null });
    expect(commit.mock.calls[0]?.[5]).toEqual({ expectedHeadSha: expect.any(String) });
    expect(await remoteText('moved.md')).toBe(V0);
    await expect(remoteText()).rejects.toThrow();
    expect(a.tree.value.map((t) => t.path)).toEqual(['moved.md']);
  });

  it('retries a rename when the branch moved', async () => {
    const a = device();
    await a.loadTree();
    const commit = vi
      .spyOn(remote, 'commitFiles')
      .mockRejectedValueOnce(new ConflictError('moved'));
    await a.renameFile(FILE, 'moved.md');
    expect(commit).toHaveBeenCalledTimes(2);
    expect(await remoteText('moved.md')).toBe(V0);
  });

  it('commitTransform moves an item between two files in one commit', async () => {
    remote.load({ 'a.md': '- x\n- y\n', 'b.md': '- z\n' }, []);
    const s = device();
    await s.loadTree();
    await s.openFile('a.md');
    await s.openFile('b.md');
    const commit = vi.spyOn(remote, 'commitFiles');
    await s.commitTransform(
      ['a.md', 'b.md'],
      (c) => ({ 'a.md': '- y\n', 'b.md': `${c['b.md']}- x\n` }),
      'move',
    );
    expect(commit).toHaveBeenCalledTimes(1);
    expect(await remoteText('a.md')).toBe('- y\n');
    expect(await remoteText('b.md')).toBe('- z\n- x\n');
    expect(s.openFiles.value['a.md']?.content).toBe('- y\n');
  });

  it('commitTransform reconciles a file whose remote changed first', async () => {
    remote.load({ 'a.md': '- x\n- y\n', 'b.md': '- z\n' }, []);
    const s = device();
    await s.loadTree();
    await s.openFile('a.md');
    await s.openFile('b.md');
    await pushRemote('- z\n- w\n', 'b.md');
    await s.commitTransform(
      ['a.md', 'b.md'],
      (c) => ({ 'a.md': '- y\n', 'b.md': `${c['b.md']}- x\n` }),
      'move',
    );
    expect(await remoteText('b.md')).toBe('- z\n- w\n- x\n');
  });

  it('commitTransform retries on a moved branch', async () => {
    remote.load({ 'a.md': '1\n' }, []);
    const s = device();
    await s.loadTree();
    const commit = vi
      .spyOn(remote, 'commitFiles')
      .mockRejectedValueOnce(new ConflictError('moved'));
    await s.commitTransform(['a.md'], () => ({ 'a.md': '2\n' }), 'edit');
    expect(commit).toHaveBeenCalledTimes(2);
    expect(await remoteText('a.md')).toBe('2\n');
  });

  it('loadTree no longer resurrects a cached file deleted remotely, but keeps a local create', async () => {
    const db = await openLifeOsDb();
    const item = (path: string, sha: string) => ({
      path,
      mode: '100644',
      type: 'blob',
      sha,
      url: '',
    });
    await db.put(
      'trees',
      [item(FILE, 'x'), item('ghost.md', 'abc123'), item('local.md', '')],
      'tree:o/r ',
    );
    for (const p of ['ghost.md', 'local.md']) {
      await db.put('files', { path: `o/r:${p}`, content: 'c', sha: '', timestamp: 1, dirty: true });
    }
    db.close();
    const a = device();
    await a.loadTree();
    const paths = a.tree.value.map((t) => t.path);
    expect(paths).not.toContain('ghost.md');
    expect(paths).toContain('local.md');
    expect(paths).toContain(FILE);
  });
});

describe('phase 2 review fixes', () => {
  /** Runs `during` once, right after the next tree listing was read and before it is returned. */
  const duringNextTreeFetch = (during: () => Promise<void>) => {
    const real = remote.fetchRepoTree.bind(remote);
    vi.spyOn(remote, 'fetchRepoTree').mockImplementationOnce(async (...args) => {
      const listing = await real(...args);
      await during();
      return listing;
    });
  };

  it('syncNow keeps a save that finished while the tree was being listed', async () => {
    remote.load({ [FILE]: V0, 'other.md': 'x' }, []);
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    await remote.saveFile(
      'o',
      'r',
      'other.md',
      'y',
      'other device',
      (await remote.getFileContent('o', 'r', 'other.md')).sha,
    );
    a.updateFileContent(FILE, 'a\nb\nc\nd\nE\n');
    duringNextTreeFetch(() => a.saveFile(FILE));

    await a.syncNow();
    expect(a.openFiles.value[FILE]?.content).toBe('a\nb\nc\nd\nE\n');
    expect(a.dirtyFiles.value.has(FILE)).toBe(false);
    expect(a.tree.value.find((t) => t.path === FILE)?.sha).toBe(a.openFiles.value[FILE]?.sha);
    expect(await remoteText()).toBe('a\nb\nc\nd\nE\n');
  });

  it('commitTransform does not reconcile against a listing older than a save', async () => {
    remote.load({ 'a.md': '1\n' }, []);
    const s = device();
    await s.loadTree();
    await s.openFile('a.md');
    s.updateFileContent('a.md', '2\n');
    duringNextTreeFetch(() => s.saveFile('a.md'));
    let seen = '';
    await s.commitTransform(
      ['a.md'],
      (c) => {
        seen = c['a.md'] ?? '';
        return { 'a.md': `${seen}3\n` };
      },
      'edit',
    );
    expect(seen).toBe('2\n');
    expect(await remoteText('a.md')).toBe('2\n3\n');
  });

  it('syncNow stops when the repo changed while a blob was read', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    await pushRemote('A\nb\nc\nd\ne\n');
    const real = remote.getBlobBytes.bind(remote);
    vi.spyOn(remote, 'getBlobBytes').mockImplementationOnce(async (...args) => {
      const bytes = await real(...args);
      githubProfileStore.currentRepo.value = {
        full_name: 'o/other',
        name: 'other',
        owner: { login: 'o' },
        default_branch: 'main',
      } as never;
      return bytes;
    });
    await a.syncNow();
    expect(a.openFiles.value[FILE]?.content).toBe(V0);
  });

  it('commitTransform keeps edits typed while the commit was in flight', async () => {
    remote.load({ 'a.md': '- x\n- y\n- w\n- v\n' }, []);
    const s = device();
    await s.loadTree();
    await s.openFile('a.md');
    const real = remote.commitFiles.bind(remote);
    vi.spyOn(remote, 'commitFiles').mockImplementationOnce(async (...args) => {
      s.updateFileContent('a.md', '- x\n- y\n- w\n- V\n');
      return real(...args);
    });
    await s.commitTransform(['a.md'], () => ({ 'a.md': '- y\n- w\n- v\n' }), 'drop x');
    expect(await remoteText('a.md')).toBe('- y\n- w\n- v\n');
    expect(s.openFiles.value['a.md']?.content).toBe('- y\n- w\n- V\n');
    expect(s.dirtyFiles.value.has('a.md')).toBe(true);
    await s.saveFile('a.md');
    expect(await remoteText('a.md')).toBe('- y\n- w\n- V\n');
  });

  it('renameFile carries edits typed during the commit to the new path', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    const real = remote.commitFiles.bind(remote);
    vi.spyOn(remote, 'commitFiles').mockImplementationOnce(async (...args) => {
      a.updateFileContent(FILE, 'a\nb\nc\nd\nE\n');
      return real(...args);
    });
    await a.renameFile(FILE, 'moved.md');
    expect(a.openFiles.value['moved.md']?.content).toBe('a\nb\nc\nd\nE\n');
    expect(a.dirtyFiles.value.has('moved.md')).toBe(true);
    expect(a.dirtyFiles.value.has(FILE)).toBe(false);
  });

  it('deleteFile clears the dirty state of the removed path', async () => {
    const a = device();
    await a.loadTree();
    await a.openFile(FILE);
    a.updateFileContent(FILE, 'x\n');
    await a.deleteFile(FILE);
    expect(a.unsyncedCount.value).toBe(0);
    await a.flushPendingWrites();
    const reloaded = device();
    await reloaded.flushOutbox();
    expect(reloaded.unsyncedCount.value).toBe(0);
  });

  it('renameFolder clears the dirty state of the moved files', async () => {
    remote.load({ 'dir/a.md': 'a\n' }, []);
    const a = device();
    await a.loadTree();
    await a.openFile('dir/a.md');
    a.updateFileContent('dir/a.md', 'b\n');
    await a.renameFolder('dir', 'dir2');
    expect(a.unsyncedCount.value).toBe(0);
  });

  it('commitTransform makes no commit when the transform changes nothing', async () => {
    remote.load({ 'a.md': '1\n' }, []);
    const s = device();
    await s.loadTree();
    const commit = vi.spyOn(remote, 'commitFiles');
    await s.commitTransform(['a.md'], () => ({}), 'noop');
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('openFile', () => {
  it('lets a concurrent caller wait for the load in flight instead of returning empty-handed', async () => {
    // Regression: the second call returned at once, before the file was in openFiles, so the
    // mobile dashboard read its config as missing and collapsed to a single page.
    const a = device();
    await a.loadTree();
    const first = a.openFile(FILE);
    await a.openFile(FILE);
    expect(a.openFiles.value[FILE]?.content).toBe(V0);
    await first;
  });
});
