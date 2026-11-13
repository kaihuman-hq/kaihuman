import '../db.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCoreStorage } from '../storage/adapter.js';

const remote = vi.hoisted(() => ({
  tree: [] as unknown[],
  renameFolder: vi.fn(),
}));
vi.mock('../services/github.service.js', () => ({
  githubService: {
    fetchRepoTree: async () => remote.tree,
    getHeadSha: async () => 'head',
    renameFolder: remote.renameFolder,
  },
}));

import { GithubFileStore } from './github-file.store.js';
import { githubProfileStore } from './github-profile.store.js';

const blob = (path: string, sha: string) => ({ path, mode: '100644', type: 'blob', sha, url: '' });

describe('githubFileStore.migrateAppFolder', () => {
  let store: GithubFileStore;
  beforeEach(() => {
    githubProfileStore.currentRepo.value = {
      full_name: 'o/mig',
      name: 'mig',
      owner: { login: 'o' },
      default_branch: 'main',
    } as never;
    getCoreStorage().removeItem('kh_migration_done:o/mig');
    remote.renameFolder.mockReset();
    store = new GithubFileStore();
  });

  it('a failed rename does not throw, keeps .lifeos readable and retries next time', async () => {
    remote.tree = [blob('.lifeos/work.todos.md', 'w1')];
    await store.loadTree();
    remote.renameFolder.mockRejectedValueOnce(new Error('Update is not a fast forward'));

    await expect(store.migrateAppFolder()).resolves.toBeUndefined();
    expect(store.appFolder.value).toBe('.lifeos');
    expect(store.tree.value.map((t) => t.path)).toContain('.lifeos/work.todos.md');
    expect(getCoreStorage().getItem('kh_migration_done:o/mig')).toBeNull();

    remote.renameFolder.mockResolvedValueOnce(undefined);
    await store.migrateAppFolder();
    expect(remote.renameFolder).toHaveBeenCalledTimes(2);
  });
});
