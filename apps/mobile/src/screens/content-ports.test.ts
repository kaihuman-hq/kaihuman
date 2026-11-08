import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSyncActions } from '../sync/actions.js';
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

  it('fetches when the tree sha moved on', async () => {
    githubFileStore.tree.value = [{ path: 'a.md', mode: '', type: 'blob', sha: 's2', url: '' }];
    const open = vi.spyOn(githubFileStore, 'openFile').mockImplementation(async () => {
      githubFileStore.openFiles.value = { 'a.md': { content: 'fresh', sha: 's2' } };
    });
    expect(await githubContentFiles.read('a.md')).toBe('fresh');
    expect(open).toHaveBeenCalledWith('a.md');
  });

  it('keeps serving a dirty copy whatever the tree says', async () => {
    githubFileStore.tree.value = [{ path: 'a.md', mode: '', type: 'blob', sha: 's2', url: '' }];
    githubFileStore.dirtyFiles.value = new Set(['a.md']);
    expect(await githubContentFiles.read('a.md')).toBe('cached');
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
});
