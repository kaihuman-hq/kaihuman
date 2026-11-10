import { authStore, githubFileStore, githubProfileStore } from '@kaihuman/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-battery', () => ({
  addLowPowerModeListener: () => ({ remove: () => {} }),
  isLowPowerModeEnabledAsync: async () => false,
}));
vi.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: () => {} }),
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }), currentState: 'background' },
}));

afterEach(() => {
  authStore.token.value = null;
  githubProfileStore.currentRepo.value = null;
  vi.restoreAllMocks();
});

describe('startSync', () => {
  it('syncs right after sign-in, without a manual refresh', async () => {
    // Regression: after login nothing synced until the user pressed sync.
    authStore.token.value = null;
    githubProfileStore.currentRepo.value = null;
    const loadTree = vi.spyOn(githubFileStore, 'loadTree').mockResolvedValue(undefined);
    vi.spyOn(githubFileStore, 'flushOutbox').mockResolvedValue(undefined);
    const { startSync } = await import('./runtime.js');
    const stop = startSync({ bridge: { reconcile: async () => 0, sync: async () => undefined } });
    await vi.waitFor(() => expect(loadTree).toHaveBeenCalled()); // the launch run
    loadTree.mockClear();

    githubProfileStore.currentRepo.value = {
      full_name: 'o/r',
      name: 'r',
      owner: { login: 'o' },
      default_branch: 'main',
    } as never;
    authStore.token.value = 'fresh-token';
    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(1));
    stop();
  });
});
