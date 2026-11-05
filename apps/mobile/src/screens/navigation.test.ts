import {
  authStore,
  configureCoreStorage,
  exitDemoMode,
  githubProfileStore,
  InMemoryStorageAdapter,
  isDemoMode,
} from '@kaihuman/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDeepLink, routeToUrl } from '../navigation/routes.js';
import { LoginScreenController } from './login-screen.js';
import { RepoSelectorController } from './repo-selector-screen.js';

const mkRepo = (name: string) => ({
  id: name.length,
  name,
  full_name: `me/${name}`,
  private: true,
  owner: { login: 'me', avatar_url: '' },
  default_branch: 'main',
  updated_at: '',
});

beforeEach(() => {
  configureCoreStorage(new InMemoryStorageAdapter());
  authStore.token.value = null;
});

describe('parseDeepLink', () => {
  it('parses every route', () => {
    expect(parseDeepLink('kaihuman://auth/callback?access_token=gho_1')).toEqual({
      name: 'auth-callback',
      accessToken: 'gho_1',
    });
    expect(parseDeepLink('kaihuman://auth/callback')).toEqual({
      name: 'auth-callback',
      accessToken: null,
    });
    for (const kind of ['todo', 'note', 'log', 'idea', 'knowledge']) {
      expect(parseDeepLink(`kaihuman://quick-${kind}`)).toEqual({ name: 'quick-capture', kind });
    }
    expect(parseDeepLink('kaihuman://board')).toEqual({ name: 'board' });
    expect(parseDeepLink('kaihuman://files/.kh/inbox.todos.md')).toEqual({
      name: 'file',
      path: '.kh/inbox.todos.md',
    });
    expect(parseDeepLink('kaihuman://files/a%20b/c.md')).toEqual({
      name: 'file',
      path: 'a b/c.md',
    });
  });

  it('rejects foreign schemes and unknown routes', () => {
    for (const bad of [
      'https://x.com/board',
      'kaihuman://nope',
      'kaihuman://quick-bogus',
      'kaihuman://files',
      'nope',
      '',
    ]) {
      expect(parseDeepLink(bad)).toBeNull();
    }
  });

  it('round-trips through routeToUrl', () => {
    for (const url of ['kaihuman://quick-log', 'kaihuman://board', 'kaihuman://files/a%20b/c.md']) {
      const route = parseDeepLink(url);
      if (!route || route.name === 'auth-callback') throw new Error('unexpected');
      expect(routeToUrl(route)).toBe(url);
    }
  });
});

describe('LoginScreenController', () => {
  const login = new LoginScreenController('https://auth.example.com/login');

  it('adds client=mobile to the login URL', () => {
    expect(login.buildLoginUrl()).toBe('https://auth.example.com/login?client=mobile');
  });

  it('accepts the OAuth callback and ignores other links', () => {
    expect(login.handleDeepLink('kaihuman://board')).toBe(false);
    expect(login.handleDeepLink('kaihuman://auth/callback')).toBe(false);
    expect(authStore.token.value).toBeNull();
    expect(login.handleDeepLink('kaihuman://auth/callback?access_token=gho_cb')).toBe(true);
    expect(authStore.token.value).toBe('gho_cb');
  });

  it('signs in with a trimmed PAT and rejects blanks', () => {
    expect(login.signInWithToken('   ')).toBe(false);
    expect(authStore.token.value).toBeNull();
    expect(login.signInWithToken(' ghp_pat ')).toBe(true);
    expect(authStore.token.value).toBe('ghp_pat');
  });

  it('enters demo mode in one tap', () => {
    login.enterDemo();
    expect(isDemoMode.value).toBe(true);
    expect(authStore.user.value).not.toBeNull();
    expect(githubProfileStore.currentRepo.value).not.toBeNull();
    exitDemoMode();
    expect(isDemoMode.value).toBe(false);
  });
});

describe('RepoSelectorController', () => {
  it('switches repositories and rejects unknown ones', () => {
    const ctl = new RepoSelectorController();
    githubProfileStore.repos.value = [mkRepo('a'), mkRepo('bb')];
    expect(ctl.select('me/bb')).toBe(true);
    expect(ctl.current?.name).toBe('bb');
    expect(ctl.select('me/zzz')).toBe(false);
    expect(ctl.current?.name).toBe('bb');
  });

  it('delegates refresh to the profile store', async () => {
    const fetchRepos = vi.spyOn(githubProfileStore, 'fetchRepos').mockResolvedValue(undefined);
    await new RepoSelectorController().refresh();
    expect(fetchRepos).toHaveBeenCalled();
    fetchRepos.mockRestore();
  });
});
