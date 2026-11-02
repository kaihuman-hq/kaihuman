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
    },
  };
});

const { createIdeaFile } = await import('./ideas-files');

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
