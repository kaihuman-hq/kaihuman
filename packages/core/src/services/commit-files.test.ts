import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from './conflict.js';
import { GithubService } from './github.service.js';
import { InMemoryGithubService } from './github.service.memory.js';

describe('InMemoryGithubService.commitFiles', () => {
  it('deletes null paths, guards on the head and returns blob shas', async () => {
    const svc = new InMemoryGithubService();
    const first = await svc.commitFiles('o', 'r', 'main', { 'a.md': 'x', 'b.md': 'y' }, 'm1');
    expect(Object.keys(first.blobShas).sort()).toEqual(['a.md', 'b.md']);
    const head = await svc.getHeadSha('o', 'r', 'main');
    expect(first.commitSha).toBe(head);

    const second = await svc.commitFiles('o', 'r', 'main', { 'b.md': null }, 'm2', {
      expectedHeadSha: head,
    });
    expect(second.blobShas).toEqual({});
    expect(second.commitSha).not.toBe(head);
    expect((await svc.fetchRepoTree('o', 'r', 'main')).map((t) => t.path)).toEqual(['a.md']);

    await expect(
      svc.commitFiles('o', 'r', 'main', { 'a.md': 'z' }, 'm3', { expectedHeadSha: head }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await svc.getFileContent('o', 'r', 'a.md')).content).toBe('x');
  });
});

describe('GithubService.commitFiles', () => {
  const git = {
    getRef: vi.fn(),
    getCommit: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    updateRef: vi.fn(),
  };
  let svc: GithubService;

  beforeEach(() => {
    for (const fn of Object.values(git)) fn.mockReset();
    git.getRef.mockResolvedValue({ data: { object: { sha: 'head1' } } });
    git.getCommit.mockResolvedValue({ data: { tree: { sha: 'tree0' } } });
    git.createTree.mockResolvedValue({
      data: {
        sha: 'tree1',
        tree: [
          { path: 'a.md', sha: 'blobA' },
          { path: 'untouched.md', sha: 'blobU' },
        ],
      },
    });
    git.createCommit.mockResolvedValue({ data: { sha: 'commit2' } });
    git.updateRef.mockResolvedValue({});
    svc = new GithubService();
    // Seam: getClient is the single place the Octokit client is built, so replace it.
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({ git });
  });

  it('turns null into a sha:null entry and returns written blob shas', async () => {
    const res = await svc.commitFiles('o', 'r', 'main', { 'a.md': 'x', 'd.md': null }, 'msg', {
      expectedHeadSha: 'head1',
    });
    expect(git.createTree.mock.calls[0]?.[0].tree).toEqual([
      { path: 'a.md', mode: '100644', type: 'blob', content: 'x' },
      { path: 'd.md', mode: '100644', type: 'blob', sha: null },
    ]);
    expect(res).toEqual({ commitSha: 'commit2', blobShas: { 'a.md': 'blobA' } });
  });

  it('throws ConflictError before creating anything when the head moved', async () => {
    await expect(
      svc.commitFiles('o', 'r', 'main', { 'a.md': 'x' }, 'msg', { expectedHeadSha: 'old' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(git.createTree).not.toHaveBeenCalled();
    expect(git.createCommit).not.toHaveBeenCalled();
  });

  it.each([409, 422])('maps a %i from updateRef to ConflictError', async (status) => {
    git.updateRef.mockRejectedValue(Object.assign(new Error('not ff'), { status }));
    await expect(svc.commitFiles('o', 'r', 'main', { 'a.md': 'x' }, 'msg')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('rethrows other updateRef errors', async () => {
    git.updateRef.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(
      svc.commitFiles('o', 'r', 'main', { 'a.md': 'x' }, 'msg'),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('getHeadSha reads the ref', async () => {
    expect(await svc.getHeadSha('o', 'r', 'main')).toBe('head1');
  });
});
