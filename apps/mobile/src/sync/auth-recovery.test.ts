import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AuthRecoveryDeps,
  checkGithubToken,
  isAuthFailure,
  recoverAuth,
  SESSION_EXPIRED,
  sessionNotice,
  type TokenCheck,
} from './auth-recovery.js';

afterEach(() => {
  sessionNotice.value = null;
});

function deps(
  token: string | null,
  verdicts: Record<string, TokenCheck>,
  candidates: string[] = [],
) {
  const state = { token };
  const d = {
    token: () => state.token,
    candidates: async () => candidates,
    check: vi.fn(async (t: string) => verdicts[t] ?? 'invalid'),
    adopt: vi.fn((t: string) => {
      state.token = t;
    }),
    signOut: vi.fn(() => {
      state.token = null;
    }),
  } satisfies AuthRecoveryDeps;
  return { d, state };
}

describe('isAuthFailure', () => {
  it('matches GitHub 401 messages only', () => {
    expect(isAuthFailure('Bad credentials - https://docs.github.com/rest')).toBe(true);
    expect(isAuthFailure('Requires authentication')).toBe(true);
    expect(isAuthFailure('Network request failed')).toBe(false);
    expect(isAuthFailure(null)).toBe(false);
  });
});

describe('recoverAuth', () => {
  it('keeps a token GitHub still accepts (transient 401) and signs nobody out', async () => {
    const { d } = deps('good', { good: 'valid' });
    expect(await recoverAuth(d)).toBe('valid');
    expect(d.signOut).not.toHaveBeenCalled();
    expect(sessionNotice.value).toBeNull();
  });

  it('adopts a stored copy that still works when the session token is stale', async () => {
    // Regression: a stale token won at cold start and the banner stayed until logout + login.
    const { d, state } = deps('stale', { fresh: 'valid' }, ['stale', 'fresh']);
    expect(await recoverAuth(d)).toBe('replaced');
    expect(state.token).toBe('fresh');
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('signs out with a notice when no copy works', async () => {
    const { d } = deps('revoked', {}, ['revoked', 'older']);
    expect(await recoverAuth(d)).toBe('signed-out');
    expect(d.signOut).toHaveBeenCalledOnce();
    expect(sessionNotice.value).toBe(SESSION_EXPIRED);
  });

  it('refreshes an expired GitHub App token instead of signing out', async () => {
    // Regression: the 8-hour token expired and the 401 recovery signed the user out.
    const { d, state } = deps('expired', { renewed: 'valid' }, ['expired']);
    const refresh = vi.fn(async () => {
      state.token = 'renewed';
      return 'refreshed' as const;
    });
    expect(await recoverAuth({ ...d, refresh })).toBe('replaced');
    expect(refresh).toHaveBeenCalledOnce();
    expect(state.token).toBe('renewed');
    expect(d.signOut).not.toHaveBeenCalled();
    expect(sessionNotice.value).toBeNull();
  });

  it('keeps the session while the refresh service cannot be reached', async () => {
    const { d } = deps('expired', {}, ['expired']);
    const refresh = vi.fn(async () => 'unknown' as const);
    expect(await recoverAuth({ ...d, refresh })).toBe('unknown');
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('signs out when the refresh token is rejected too', async () => {
    const { d } = deps('expired', {}, ['expired']);
    const refresh = vi.fn(async () => 'invalid' as const);
    expect(await recoverAuth({ ...d, refresh })).toBe('signed-out');
    expect(d.signOut).toHaveBeenCalledOnce();
  });

  it('does nothing while GitHub cannot be asked', async () => {
    const { d } = deps('t', { t: 'unknown' });
    expect(await recoverAuth(d)).toBe('unknown');
    expect(d.signOut).not.toHaveBeenCalled();
  });
});

describe('checkGithubToken', () => {
  const respond = (status: number) => vi.fn(async () => new Response('{}', { status }));
  it('maps 200, 401, other statuses and network errors', async () => {
    expect(await checkGithubToken('t', respond(200))).toBe('valid');
    expect(await checkGithubToken('t', respond(401))).toBe('invalid');
    expect(await checkGithubToken('t', respond(503))).toBe('unknown');
    const offline = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await checkGithubToken('t', offline)).toBe('unknown');
  });
});
