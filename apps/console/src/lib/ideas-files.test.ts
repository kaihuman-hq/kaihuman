import { gitBlobSha } from '@kaihuman/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ remember: vi.fn() }));
vi.mock('./repo-files', () => ({ loadRepoFiles: vi.fn(), rememberRepoFile: h.remember }));
vi.mock('@kaihuman/core', async (importOriginal) => {
  const { signal } = await import('@preact/signals');
  return {
    ...(await importOriginal<typeof import('@kaihuman/core')>()),
    githubFileStore: {
      loadedRepo: signal('me/ideas'),
      // The tree still holds the sha of the version before the write.
      tree: signal([{ path: '.kh/ideas/a.md', type: 'blob', sha: 'old-tree-sha' }]),
      openFiles: signal({}),
      dirtyFiles: signal(new Set<string>()),
      error: signal(null),
      createFile: vi.fn(async () => {}),
      discardLocal: vi.fn(async () => {}),
    },
  };
});

const { createIdeaFile } = await import('./ideas-files');
const { githubFileStore } = await import('@kaihuman/core');

beforeEach(() => vi.clearAllMocks());

describe('ideas-files remember', () => {
  it("caches a written file under the content's blob sha, not the stale tree sha", async () => {
    await createIdeaFile('.kh/ideas/b.md', 'hello\n');
    expect(h.remember).toHaveBeenCalledWith(
      'me/ideas',
      '.kh/ideas/b.md',
      gitBlobSha('hello\n'),
      'hello\n',
    );
  });
});

describe('ideas-files createIdeaFile rollback', () => {
  it('discards every local trace of a create that failed to save', async () => {
    const path = '.kh/ideas/c.md';
    vi.mocked(githubFileStore.createFile).mockImplementationOnce(async () => {
      githubFileStore.tree.value = [
        ...githubFileStore.tree.peek(),
        { path, type: 'blob' } as never,
      ];
      githubFileStore.dirtyFiles.value = new Set([path]);
      githubFileStore.error.value = 'offline' as never;
    });
    vi.mocked(githubFileStore.discardLocal).mockImplementationOnce(async () => {
      githubFileStore.dirtyFiles.value = new Set();
    });

    await expect(createIdeaFile(path, 'x\n')).rejects.toThrow('offline');
    expect(githubFileStore.discardLocal).toHaveBeenCalledWith(path);
    expect(githubFileStore.tree.peek().some((item) => item.path === path)).toBe(false);
    expect(h.remember).not.toHaveBeenCalled();
  });
});
