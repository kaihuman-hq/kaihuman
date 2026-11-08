import {
  authStore,
  configureCoreStorage,
  exitDemoMode,
  getCoreStorage,
  githubProfileStore,
  InMemoryStorageAdapter,
  isDemoMode,
} from '@kaihuman/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDeepLink, routeToUrl } from '../navigation/routes.js';
import { routeToHref } from '../runtime/pending-url.js';
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
    expect(parseDeepLink('kaihuman://inbox')).toEqual({ name: 'inbox' });
    expect(parseDeepLink('kaihuman://inbox/x')).toBeNull();
    expect(routeToUrl({ name: 'inbox' })).toBe('kaihuman://inbox');
    expect(parseDeepLink('kaihuman://demo')).toEqual({ name: 'demo' });
    expect(parseDeepLink('kaihuman://demo/x')).toBeNull();
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

  it('parses widget deep links with params', () => {
    expect(parseDeepLink('kaihuman://ideas')).toEqual({ name: 'ideas' });
    expect(parseDeepLink('kaihuman://ideas?status=seed')).toEqual({
      name: 'ideas',
      status: 'seed',
    });
    expect(parseDeepLink('kaihuman://ideas?status=all')).toEqual({ name: 'ideas', status: 'all' });
    expect(parseDeepLink('kaihuman://ideas?status=bogus')).toEqual({ name: 'ideas' });
    expect(parseDeepLink('kaihuman://ideas/x')).toBeNull();
    expect(parseDeepLink('kaihuman://quick-log?idea=solar-balcony')).toEqual({
      name: 'quick-capture',
      kind: 'log',
      idea: 'solar-balcony',
    });
    expect(parseDeepLink('kaihuman://quick-todo?idea=x')).toEqual({
      name: 'quick-capture',
      kind: 'todo',
    });
    expect(parseDeepLink('kaihuman://quick-log?idea=')).toEqual({
      name: 'quick-capture',
      kind: 'log',
    });
    expect(parseDeepLink('kaihuman://board?milestone=v1')).toEqual({
      name: 'board',
      milestone: 'v1',
    });
    expect(parseDeepLink('kaihuman://board?item=abc')).toEqual({ name: 'board', item: 'abc' });
  });

  it('maps routes to expo-router hrefs with params', () => {
    const href = (url: string) => {
      const route = parseDeepLink(url);
      if (!route) throw new Error('unparsed');
      return routeToHref(route);
    };
    expect(href('kaihuman://ideas')).toBe('/ideas');
    expect(href('kaihuman://ideas?status=exploring')).toBe('/ideas?status=exploring');
    expect(href('kaihuman://quick-log?idea=a%20b')).toBe('/quick-log?idea=a%20b');
    expect(href('kaihuman://quick-log')).toBe('/quick-log');
    expect(href('kaihuman://board?milestone=v1&item=t1')).toBe('/board?milestone=v1&item=t1');
    expect(href('kaihuman://board')).toBe('/board');
  });

  it('round-trips through routeToUrl', () => {
    for (const url of [
      'kaihuman://quick-log',
      'kaihuman://quick-log?idea=solar',
      'kaihuman://ideas',
      'kaihuman://ideas?status=seed',
      'kaihuman://board?milestone=v1',
      'kaihuman://board?item=t1',
      'kaihuman://board',
      'kaihuman://demo',
      'kaihuman://files/a%20b/c.md',
    ]) {
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

  describe('handleAuthResult', () => {
    beforeEach(() => {
      authStore.token.value = null;
    });

    it('stores the token from a successful auth session', () => {
      expect(
        login.handleAuthResult({
          type: 'success',
          url: 'kaihuman://auth/callback?access_token=gho_session',
        }),
      ).toBe('signed-in');
      expect(authStore.token.value).toBe('gho_session');
    });

    it('reports a successful redirect without a token', () => {
      expect(login.handleAuthResult({ type: 'success', url: 'kaihuman://auth/callback' })).toBe(
        'no-token',
      );
      expect(
        login.handleAuthResult({ type: 'success', url: 'https://evil.example/?access_token=x' }),
      ).toBe('no-token');
      expect(authStore.token.value).toBeNull();
    });

    it('treats cancel, dismiss and locked as a quiet cancel', () => {
      for (const type of ['cancel', 'dismiss', 'locked'] as const) {
        expect(login.handleAuthResult({ type })).toBe('cancelled');
      }
      expect(authStore.token.value).toBeNull();
    });
  });

  it('opens the login URL with the app callback as the return URL', async () => {
    const open = vi.fn().mockResolvedValue({ type: 'cancel' });
    await expect(login.signInWithBrowser(open)).resolves.toBe('cancelled');
    expect(open).toHaveBeenCalledWith(
      'https://auth.example.com/login?client=mobile',
      'kaihuman://auth/callback',
    );
  });

  it('signs in with a trimmed PAT and rejects blanks', () => {
    expect(login.signInWithToken('   ')).toBe(false);
    expect(authStore.token.value).toBeNull();
    getCoreStorage().setItem('lifeos_logged_out', 'true');
    expect(login.signInWithToken(' ghp_pat ')).toBe(true);
    expect(authStore.token.value).toBe('ghp_pat');
    // Otherwise the next launch treats the new session as logged out and wipes the token.
    expect(getCoreStorage().getItem('lifeos_logged_out')).toBeNull();
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
