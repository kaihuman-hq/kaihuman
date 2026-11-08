import { describe, expect, it } from 'vitest';
import {
  filterRepos,
  guardRedirect,
  pickPreselect,
  resolveStartRoute,
  sortByRecentPush,
} from './start-route.js';

const repo = (name: string, pushed = '2026-01-01T00:00:00Z') => ({
  full_name: `me/${name}`,
  name,
  private: false,
  default_branch: 'main',
  updated_at: pushed,
  pushed_at: pushed,
});

describe('resolveStartRoute', () => {
  it('goes to login without a token, whatever the repo', () => {
    expect(resolveStartRoute({ token: null, repo: null })).toBe('/login');
    expect(resolveStartRoute({ token: '', repo: repo('a') })).toBe('/login');
  });
  it('goes to onboarding with a token but no repo', () => {
    expect(resolveStartRoute({ token: 't', repo: null })).toBe('/onboarding');
  });
  it('goes to Today with a token and a repo', () => {
    expect(resolveStartRoute({ token: 't', repo: repo('a') })).toBe('/dashboard');
  });
});

describe('guardRedirect', () => {
  const ready = { token: 't', repo: repo('a') };
  it('lets auth screens stay while signed out', () => {
    expect(guardRedirect({ token: null, repo: null }, 'login')).toBeNull();
    expect(guardRedirect({ token: null, repo: null }, 'auth')).toBeNull();
  });
  it('sends a signed-out user on any other screen to login', () => {
    expect(guardRedirect({ token: null, repo: null }, '(tabs)')).toBe('/login');
  });
  it('moves login to onboarding or Today once a token arrives', () => {
    expect(guardRedirect({ token: 't', repo: null }, 'login')).toBe('/onboarding');
    expect(guardRedirect(ready, 'login')).toBe('/dashboard');
  });
  it('keeps onboarding until a repo is chosen, then leaves it', () => {
    expect(guardRedirect({ token: 't', repo: null }, 'onboarding')).toBeNull();
    expect(guardRedirect(ready, 'onboarding')).toBe('/dashboard');
  });
  it('sends app screens back to onboarding when the repo is cleared', () => {
    expect(guardRedirect({ token: 't', repo: null }, '(tabs)')).toBe('/onboarding');
  });
  it('does not touch app screens when ready', () => {
    expect(guardRedirect(ready, '(tabs)')).toBeNull();
    expect(guardRedirect(ready, 'repos')).toBeNull();
  });
  it('does nothing before the first segment is known', () => {
    expect(guardRedirect({ token: null, repo: null }, undefined)).toBeNull();
  });
});

describe('sortByRecentPush', () => {
  it('orders newest push first, falling back to updated_at, without mutating', () => {
    const list = [repo('old', '2025-01-01T00:00:00Z'), repo('new', '2026-06-01T00:00:00Z')];
    expect(sortByRecentPush(list).map((r) => r.name)).toEqual(['new', 'old']);
    expect(list[0]?.name).toBe('old');
    const noPush = { ...repo('x'), pushed_at: null, updated_at: '2027-01-01T00:00:00Z' };
    expect(sortByRecentPush([repo('a'), noPush])[0]?.name).toBe('x');
  });
});

describe('pickPreselect', () => {
  it('preselects the only plausible Life OS repo', () => {
    expect(pickPreselect([repo('blog'), repo('my-kaihuman'), repo('dotfiles')])?.name).toBe(
      'my-kaihuman',
    );
    expect(pickPreselect([repo('life-os')])?.name).toBe('life-os');
    expect(pickPreselect([repo('.kh')])?.name).toBe('.kh');
  });
  it('preselects nothing when none or several are plausible', () => {
    expect(pickPreselect([repo('blog')])).toBeNull();
    expect(pickPreselect([repo('kaihuman'), repo('life-os')])).toBeNull();
    expect(pickPreselect([])).toBeNull();
  });
});

describe('filterRepos', () => {
  it('matches case-insensitively and returns all for a blank query', () => {
    const list = [repo('Alpha'), repo('beta')];
    expect(filterRepos(list, ' ALP ').map((r) => r.name)).toEqual(['Alpha']);
    expect(filterRepos(list, '  ')).toHaveLength(2);
  });
});
