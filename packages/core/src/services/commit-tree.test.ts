import { describe, expect, it, vi } from 'vitest';
import { GithubService } from './github.service.js';
import { InMemoryGithubService } from './github.service.memory.js';

describe('GithubService.fetchCommitTree', () => {
  const setup = (truncated: boolean) => {
    const git = {
      getTree: vi.fn().mockResolvedValue({
        data: { sha: 't', tree: [{ path: 'a.md', type: 'blob', sha: 's1' }], truncated },
      }),
    };
    const svc = new GithubService();
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({ git });
    return { svc, git };
  };

  it('returns the recursive tree of a commit and says it is complete', async () => {
    const { svc, git } = setup(false);
    expect(await svc.fetchCommitTree('me', 'kb', 'c0ffee')).toEqual({
      tree: [{ path: 'a.md', type: 'blob', sha: 's1' }],
      truncated: false,
    });
    expect(git.getTree).toHaveBeenCalledWith({
      owner: 'me',
      repo: 'kb',
      tree_sha: 'c0ffee',
      recursive: 'true',
    });
  });

  it("passes on GitHub's truncated flag", async () => {
    const { svc } = setup(true);
    expect((await svc.fetchCommitTree('me', 'kb', 'c0ffee')).truncated).toBe(true);
  });
});

describe('InMemoryGithubService.fetchCommitTree', () => {
  it('returns the whole demo tree, never truncated', async () => {
    const svc = new InMemoryGithubService();
    const { tree, truncated } = await svc.fetchCommitTree('me', 'kb', 'x');
    expect(truncated).toBe(false);
    expect(tree).toEqual(await svc.fetchRepoTree('me', 'kb'));
  });
});
