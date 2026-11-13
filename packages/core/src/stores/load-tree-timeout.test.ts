import '../db.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCoreStorage } from '../storage/adapter.js';

const remote = vi.hoisted(() => ({ fetchRepoTree: vi.fn(), getHeadSha: vi.fn() }));
vi.mock('../services/github.service.js', () => ({ githubService: remote }));

import { GithubFileStore, LOAD_TREE_TIMEOUT_MS } from './github-file.store.js';
import { githubProfileStore } from './github-profile.store.js';

const realSetTimeout = globalThis.setTimeout;
const never = () => new Promise<never>(() => {});

/** Advances fake time until `p` settles; IndexedDB work in between runs on real timers. */
const settle = async (p: Promise<unknown>) => {
  let done = false;
  p.finally(() => {
    done = true;
  });
  for (let i = 0; i < 100 && !done; i++) {
    await vi.advanceTimersByTimeAsync(LOAD_TREE_TIMEOUT_MS + 1);
    await new Promise((r) => realSetTimeout(r, 5));
  }
  await p;
};

describe('githubFileStore.loadTree never hangs silently', () => {
  let store: GithubFileStore;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    githubProfileStore.currentRepo.value = {
      full_name: 'o/hang',
      name: 'hang',
      owner: { login: 'o' },
      default_branch: 'main',
    } as never;
    remote.getHeadSha.mockReset().mockResolvedValue('head');
    remote.fetchRepoTree.mockReset();
    store = new GithubFileStore();
  });
  afterEach(() => vi.useRealTimers());

  it('a GitHub request that never answers ends in an error, not an endless load', async () => {
    remote.fetchRepoTree.mockImplementation(never);
    await settle(store.loadTree());
    expect(store.isLoading.value).toBe(false);
    expect(store.error.value).toMatch(/timed out/i);
  });

  it('a cache read that never answers is skipped and the tree still loads', async () => {
    const spy = vi.spyOn(getCoreStorage(), 'getRecord').mockImplementation(never);
    remote.fetchRepoTree.mockResolvedValue([
      { path: 'a.md', mode: '100644', type: 'blob', sha: 's', url: '' },
    ]);
    await settle(store.loadTree());
    spy.mockRestore();
    expect(store.tree.value.map((t) => t.path)).toEqual(['a.md']);
    expect(store.error.value).toBeNull();
  });
});
