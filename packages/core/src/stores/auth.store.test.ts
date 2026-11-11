import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureCoreStorage } from '../storage/adapter.js';
import { InMemoryStorageAdapter } from '../storage/memory-adapter.js';
import { AuthStore } from './auth.store.js';

const NOW = 1_700_000_000_000;
const CALLBACK =
  'kaihuman://auth/callback?access_token=ghu_a&refresh_token=ghr_r&expires_in=28800&refresh_token_expires_in=15897600';

let storage: InMemoryStorageAdapter;

beforeEach(() => {
  storage = new InMemoryStorageAdapter();
  configureCoreStorage(storage);
  // The user is persisted, so restoring a session never asks GitHub.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 500 })),
  );
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AuthStore expiring tokens', () => {
  it('keeps the refresh token and expiry from the sign-in callback across a restart', async () => {
    // Regression: only access_token was kept, so a GitHub App session ended after 8 hours.
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const first = new AuthStore();
    await first.ready;
    expect(first.handleCallbackUrl(CALLBACK)).toBe(true);
    expect(first.token.value).toBe('ghu_a');
    expect(first.refreshToken.value).toBe('ghr_r');
    expect(first.tokenExpiresAt.value).toBe(NOW + 28_800_000);
    await flush();

    const restarted = new AuthStore();
    await restarted.ready;
    expect(restarted.token.value).toBe('ghu_a');
    expect(restarted.refreshToken.value).toBe('ghr_r');
    expect(restarted.tokenExpiresAt.value).toBe(NOW + 28_800_000);
    vi.restoreAllMocks();
  });

  it('saves the rotated refresh token of a renewal', async () => {
    const store = new AuthStore();
    await store.ready;
    store.handleCallbackUrl(CALLBACK);
    store.setSession({ accessToken: 'ghu_b', refreshToken: 'ghr_s', expiresIn: 60 }, NOW);
    await flush();

    const restarted = new AuthStore();
    await restarted.ready;
    expect(restarted.token.value).toBe('ghu_b');
    expect(restarted.refreshToken.value).toBe('ghr_s');
    expect(restarted.tokenExpiresAt.value).toBe(NOW + 60_000);
  });

  it('a non-expiring token and logout clear the refresh state', async () => {
    const store = new AuthStore();
    await store.ready;
    store.handleCallbackUrl(CALLBACK);
    store.setSession({ accessToken: 'ghp_pat' });
    expect(store.refreshToken.value).toBeNull();
    expect(store.tokenExpiresAt.value).toBeNull();

    store.handleCallbackUrl(CALLBACK);
    store.logout();
    await flush();
    expect(store.refreshToken.value).toBeNull();
    expect(await storage.getRecord('auth', 'refresh')).toBeUndefined();
  });
});

describe('AuthStore restore', () => {
  it('restores the session and refresh token that storage could not give at launch', async () => {
    // Regression (iOS): a launch on a locked phone read no token, and nothing read it again.
    storage.setItem('lifeos_gh_token', 'ghu_a');
    await storage.putRecord('auth', 'token', 'ghu_a');
    await storage.putRecord('auth', 'refresh', { refreshToken: 'ghr_r', expiresAt: NOW });

    // The locked launch: reads answer "nothing there" and, like the mobile Keychain driver,
    // deletes of what could not be read are skipped.
    const locked = [
      vi.spyOn(storage, 'getItem').mockReturnValue(null),
      vi.spyOn(storage, 'getRecord').mockResolvedValue(undefined),
      vi.spyOn(storage, 'removeItem').mockReturnValue(undefined),
      vi.spyOn(storage, 'deleteRecord').mockResolvedValue(undefined),
    ];
    const store = new AuthStore();
    await store.ready;
    await flush();
    expect(store.token.value).toBeNull();
    for (const spy of locked) spy.mockRestore();

    expect(await store.restore()).toBe(true);
    expect(store.token.value).toBe('ghu_a');
    expect(store.refreshToken.value).toBe('ghr_r');
    expect(store.tokenExpiresAt.value).toBe(NOW);
    expect(await store.restore()).toBe(false);
  });

  it('does not bring back a session the user signed out of', async () => {
    const store = new AuthStore();
    await store.ready;
    store.setSession({ accessToken: 'ghu_a' });
    await flush();
    store.logout();
    await flush();
    expect(await store.restore()).toBe(false);
    expect(store.token.value).toBeNull();
  });
});

describe('AuthStore profile fetch', () => {
  it('does not log out on a 401 while a refresh token can renew the session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    const store = new AuthStore();
    await store.ready;
    store.handleCallbackUrl(CALLBACK);
    await flush();
    expect(store.token.value).toBe('ghu_a');
    expect(store.refreshToken.value).toBe('ghr_r');
  });
});
