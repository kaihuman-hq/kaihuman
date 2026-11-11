import type { AuthSession } from '@kaihuman/core';
import { describe, expect, it, vi } from 'vitest';
import { createTokenRefresher, REFRESH_MARGIN_MS, refreshEndpointFor } from './token-refresh.js';

const NOW = 1_700_000_000_000;

function setup(
  respond: () => Promise<Response>,
  session: { refreshToken: string | null; expiresAt: number | null } = {
    refreshToken: 'ghr_old',
    expiresAt: NOW,
  },
) {
  const state = { ...session };
  const saved: AuthSession[] = [];
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respond());
  const refresher = createTokenRefresher({
    endpoint: 'https://auth.example/refresh',
    session: () => state,
    save: (s) => {
      saved.push(s);
      state.refreshToken = s.refreshToken ?? null;
    },
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
  });
  return { refresher, saved, fetchMock, state };
}

const pair = () =>
  Promise.resolve(
    Response.json({ access_token: 'ghu_new', refresh_token: 'ghr_new', expires_in: 28800 }),
  );

describe('createTokenRefresher', () => {
  it('derives the endpoint from the login URL', () => {
    expect(refreshEndpointFor('https://auth.kaihuman.com/login')).toBe(
      'https://auth.kaihuman.com/refresh',
    );
  });

  it('trades the refresh token and saves the rotated pair', async () => {
    const { refresher, saved, fetchMock } = setup(pair);
    expect(await refresher.refresh()).toBe('refreshed');
    expect(saved).toEqual([{ accessToken: 'ghu_new', refreshToken: 'ghr_new', expiresIn: 28800 }]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://auth.example/refresh');
    expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'ghr_old' });
  });

  it('sends one request for concurrent callers, since GitHub rotates the refresh token', async () => {
    const { refresher, fetchMock } = setup(pair);
    const outcomes = await Promise.all([refresher.refresh(), refresher.ensureFresh()]);
    expect(outcomes).toEqual(['refreshed', 'refreshed']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('ensureFresh waits until the token is close to expiry', async () => {
    const later = setup(pair, { refreshToken: 'r', expiresAt: NOW + REFRESH_MARGIN_MS + 1 });
    expect(await later.refresher.ensureFresh()).toBe('none');
    expect(later.fetchMock).not.toHaveBeenCalled();
    const soon = setup(pair, { refreshToken: 'r', expiresAt: NOW + REFRESH_MARGIN_MS - 1 });
    expect(await soon.refresher.ensureFresh()).toBe('refreshed');
  });

  it('does nothing without a refresh token (OAuth app token, PAT)', async () => {
    const { refresher, fetchMock } = setup(pair, { refreshToken: null, expiresAt: null });
    expect(await refresher.refresh()).toBe('none');
    expect(await refresher.ensureFresh()).toBe('none');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a rejected refresh token to invalid and outages to unknown', async () => {
    const status = (s: number) => () => Promise.resolve(Response.json({}, { status: s }));
    expect(await setup(status(401)).refresher.refresh()).toBe('invalid');
    expect(await setup(status(502)).refresher.refresh()).toBe('unknown');
    expect(await setup(() => Promise.reject(new Error('offline'))).refresher.refresh()).toBe(
      'unknown',
    );
    const { refresher, saved } = setup(status(200));
    expect(await refresher.refresh()).toBe('unknown');
    expect(saved).toEqual([]);
  });
});
