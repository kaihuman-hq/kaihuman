import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSyncActions } from '../sync/actions.js';
import { syncRevision } from '../sync/status.js';
import { githubContentFiles } from './file-editor-screen.js';

const refreshAll = vi.fn(async () => undefined);
const notifyLocalWrite = vi.fn();

beforeEach(() => {
  setSyncActions({ refreshAll, notifyLocalWrite });
  githubProfileStore.currentRepo.value = { full_name: 'o/r' } as never;
  githubFileStore.loadedRepo.value = 'o/r';
  githubFileStore.tree.value = [{ path: 'a.md', mode: '', type: 'blob', sha: 's1', url: '' }];
  githubFileStore.openFiles.value = { 'a.md': { content: 'cached', sha: 's1' } };
  githubFileStore.dirtyFiles.value = new Set();
});

afterEach(() => {
  vi.restoreAllMocks();
  refreshAll.mockClear();
  notifyLocalWrite.mockClear();
  githubProfileStore.currentRepo.value = null;
  githubFileStore.loadedRepo.value = null;
  githubFileStore.tree.value = [];
  githubFileStore.openFiles.value = {};
});

describe('githubContentFiles (cache-first)', () => {
  it('serves an unchanged open file without the network', async () => {
    const open = vi.spyOn(githubFileStore, 'openFile').mockResolvedValue(undefined);
    expect(await githubContentFiles.read('a.md')).toBe('cached');
    expect(open).not.toHaveBeenCalled();
  });

  it('serves a stale copy at once and revalidates it behind the screen', async () => {
    githubFileStore.tree.value = [{ path: 'a.md', mode: '', type: 'blob', sha: 's2', url: '' }];
    let finish = () => {};
    const open = vi.spyOn(githubFileStore, 'openFile').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            githubFileStore.openFiles.value = { 'a.md': { content: 'fresh', sha: 's2' } };
            resolve();
          };
        }),
    );
    const rev = syncRevision.peek();
    // Regression: the read used to wait for this network round trip (Boards spinner).
    expect(await githubContentFiles.read('a.md')).toBe('cached');
    expect(open).toHaveBeenCalledWith('a.md');
    finish();
    await vi.waitFor(() => expect(syncRevision.peek()).toBe(rev + 1));
    expect(await githubContentFiles.read('a.md')).toBe('fresh');
  });

  it('serves the on-device copy before the network on a cold start', async () => {
    githubFileStore.openFiles.value = {};
    vi.spyOn(githubFileStore, 'restoreCached').mockImplementation(async () => {
      githubFileStore.openFiles.value = { 'a.md': { content: 'disk', sha: 's1' } };
      return true;
    });
    const open = vi.spyOn(githubFileStore, 'openFile').mockResolvedValue(undefined);
    expect(await githubContentFiles.read('a.md')).toBe('disk');
    expect(open).not.toHaveBeenCalled();
  });

  it('waits for the network only when nothing is cached', async () => {
    githubFileStore.openFiles.value = {};
    vi.spyOn(githubFileStore, 'restoreCached').mockResolvedValue(false);
    vi.spyOn(githubFileStore, 'openFile').mockImplementation(async () => {
      githubFileStore.openFiles.value = { 'a.md': { content: 'net', sha: 's1' } };
    });
    expect(await githubContentFiles.read('a.md')).toBe('net');
  });

  it('keeps serving a dirty copy whatever the tree says', async () => {
    githubFileStore.tree.value = [{ path: 'a.md', mode: '', type: 'blob', sha: 's2', url: '' }];
    githubFileStore.dirtyFiles.value = new Set(['a.md']);
    expect(await githubContentFiles.read('a.md')).toBe('cached');
  });

  it('does not wait for a sync when a tree is cached', async () => {
    refreshAll.mockImplementationOnce(() => new Promise<undefined>(() => {}));
    // Regression: screens awaited this sync before showing cached data.
    await expect(githubContentFiles.refresh()).resolves.toBeUndefined();
  });

  it('a first load settles as soon as the cached tree is in place', async () => {
    githubFileStore.tree.value = [];
    refreshAll.mockImplementationOnce(() => {
      githubFileStore.tree.value = [{ path: 'a.md', mode: '', type: 'blob', sha: 's1', url: '' }];
      return new Promise<undefined>(() => {});
    });
    await expect(githubContentFiles.refresh()).resolves.toBeUndefined();
  });

  it('refreshes with the cheap focus reason when a tree exists, a full pull otherwise', async () => {
    await githubContentFiles.refresh();
    expect(refreshAll).toHaveBeenLastCalledWith({ reason: 'focus' });
    githubFileStore.tree.value = [];
    await githubContentFiles.refresh();
    expect(refreshAll).toHaveBeenLastCalledWith({ reason: 'pull' });
  });

  it('writes optimistically: persists the dirty copy, never saves over the network', async () => {
    const flush = vi.spyOn(githubFileStore, 'flushPendingWrites').mockResolvedValue(undefined);
    const save = vi.spyOn(githubFileStore, 'saveFile');
    await githubContentFiles.write('a.md', 'edited');
    expect(githubFileStore.openFiles.value['a.md']?.content).toBe('edited');
    expect(flush).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(notifyLocalWrite).toHaveBeenCalledTimes(1);
  });

  // Regression: when a sync had dropped the open copy (e.g. discarded a clean file), the edit
  // went to updateFileContent, which ignores paths not in openFiles, and the save was lost.
  it('reopens a file that is no longer open before writing, so the edit is kept', async () => {
    vi.spyOn(githubFileStore, 'flushPendingWrites').mockResolvedValue(undefined);
    githubFileStore.openFiles.value = {};
    const open = vi.spyOn(githubFileStore, 'openFile').mockImplementation(async () => {
      githubFileStore.openFiles.value = {
        'a.md': { content: 'remote', sha: 's1', base: 'remote' },
      };
    });
    await githubContentFiles.write('a.md', 'edited');
    expect(open).toHaveBeenCalledWith('a.md');
    expect(githubFileStore.openFiles.value['a.md']?.content).toBe('edited');
    expect(githubFileStore.dirtyFiles.value.has('a.md')).toBe(true);
    expect(notifyLocalWrite).toHaveBeenCalledTimes(1);
  });

  it('rejects instead of reporting a save when the file cannot be opened', async () => {
    githubFileStore.openFiles.value = {};
    vi.spyOn(githubFileStore, 'openFile').mockResolvedValue(undefined);
    await expect(githubContentFiles.write('a.md', 'edited')).rejects.toThrow('a.md');
    expect(notifyLocalWrite).not.toHaveBeenCalled();
  });
});
