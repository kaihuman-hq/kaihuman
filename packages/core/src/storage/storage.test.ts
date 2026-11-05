import { beforeEach, describe, expect, it, vi } from 'vitest';
import { githubService } from '../services/github.service.js';
import { authStore } from '../stores/auth.store.js';
import { githubFileStore } from '../stores/github-file.store.js';
import { githubProfileStore } from '../stores/github-profile.store.js';
import { configureCoreStorage, getCoreStorage } from './adapter.js';
import { InMemoryStorageAdapter } from './memory-adapter.js';

const repo = {
  id: 1,
  name: 'kb',
  full_name: 'me/kb',
  private: true,
  owner: { login: 'me', avatar_url: '' },
  default_branch: 'main',
  updated_at: '',
};

describe('CoreStorageAdapter', () => {
  let adapter: InMemoryStorageAdapter;
  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
    configureCoreStorage(adapter);
    githubProfileStore.currentRepo.value = repo;
  });

  it('uses an injected adapter', async () => {
    expect(getCoreStorage()).toBe(adapter);
    adapter.setItem('k', 'v');
    expect(getCoreStorage().getItem('k')).toBe('v');
    await adapter.putRecord('trees', 'a', [1]);
    expect(await adapter.getRecord('trees', 'a')).toEqual([1]);
    await adapter.deleteRecord('trees', 'a');
    expect(await adapter.getRecord('trees', 'a')).toBeUndefined();
  });

  it('persists the auth token through the adapter', async () => {
    authStore.token.value = 'gho_persist';
    await vi.waitFor(async () => {
      expect(await adapter.getRecord('auth', 'token')).toBe('gho_persist');
    });
    expect(adapter.getItem('lifeos_gh_token')).toBe('gho_persist');
  });

  it('handles a mobile deep-link callback', () => {
    adapter.setItem('lifeos_logged_out', 'true');
    expect(authStore.handleCallbackUrl('kaihuman://auth/callback?access_token=gho_test')).toBe(
      true,
    );
    expect(authStore.token.value).toBe('gho_test');
    expect(adapter.getItem('lifeos_logged_out')).toBeNull();
    expect(authStore.handleCallbackUrl('kaihuman://auth/callback')).toBe(false);
    expect(authStore.handleCallbackUrl('not a url')).toBe(false);
  });

  it('queues offline saves (latest wins) and flushes them', async () => {
    await githubFileStore.enqueueOfflineSave('a.md', 'one', 's0');
    await githubFileStore.enqueueOfflineSave('a.md', 'two', 's0');
    await githubFileStore.enqueueOfflineSave('b.md', 'bee');
    expect(await adapter.listPendingMutations()).toHaveLength(2);

    const save = vi
      .spyOn(githubService, 'saveFile')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ content: { sha: 'new' } } as never);

    expect(await githubFileStore.flushOfflineMutations()).toBe(1);
    expect(await adapter.listPendingMutations()).toHaveLength(1);
    expect(await githubFileStore.flushOfflineMutations()).toBe(1);
    expect(await adapter.listPendingMutations()).toHaveLength(0);
    expect(save).toHaveBeenCalledWith('me', 'kb', 'a.md', 'two', expect.any(String), 's0');
    save.mockRestore();
  });

  it('round-trips dirty and baseContent on file records', async () => {
    const rec = {
      path: 'me/kb:a.md',
      content: 'local',
      sha: 's1',
      timestamp: 1,
      dirty: true,
      baseContent: 'base',
    };
    await adapter.putRecord('files', rec.path, rec);
    expect(await adapter.getRecord('files', rec.path)).toEqual(rec);
    expect(await adapter.listRecords('files')).toEqual([rec]);
    expect(await adapter.listRecords('trees')).toEqual([]);
  });
});
