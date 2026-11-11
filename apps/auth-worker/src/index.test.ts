import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index.js';

const env: Env = {
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  APP_URL: 'https://app.kaihuman.com',
};

const BASE = 'https://auth.kaihuman.com';

function get(path: string, cookie?: string): Promise<Response> {
  const headers = cookie ? { Cookie: cookie } : undefined;
  return worker.fetch(new Request(`${BASE}${path}`, { headers }), env);
}

function mockGitHub(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/login', () => {
  it('redirects to GitHub with client id, callback, scope and a state cookie', async () => {
    const response = await get('/login');

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location') ?? '');
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('client-id');
    expect(location.searchParams.get('redirect_uri')).toBe(`${BASE}/callback`);
    expect(location.searchParams.get('scope')).toBe('repo');

    const state = location.searchParams.get('state');
    expect(state).toBeTruthy();
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain(`kh_oauth_state=${state};`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });
});

describe('/login?client=mobile', () => {
  it('marks the state in both the GitHub redirect and the cookie', async () => {
    const response = await get('/login?client=mobile');

    const state = new URL(response.headers.get('Location') ?? '').searchParams.get('state');
    expect(state).toMatch(/:mobile$/);
    expect(response.headers.get('Set-Cookie')).toContain(`kh_oauth_state=${state};`);
  });

  it('does not mark the state for other client values', async () => {
    const response = await get('/login?client=web');

    const state = new URL(response.headers.get('Location') ?? '').searchParams.get('state');
    expect(state).not.toContain(':mobile');
  });
});

describe('/callback', () => {
  it('redirects a mobile login to the app scheme with the token', async () => {
    mockGitHub(200, { access_token: 'gho_token' });

    const response = await get('/callback?code=abc&state=s1:mobile', 'kh_oauth_state=s1:mobile');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'kaihuman://auth/callback?access_token=gho_token',
    );
  });

  it('rejects a mobile-marked state that does not match the cookie', async () => {
    const fetchMock = mockGitHub(200, { access_token: 'gho_token' });

    const response = await get('/callback?code=abc&state=s1:mobile', 'kh_oauth_state=s1');

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges the code and redirects to the console with the token', async () => {
    const fetchMock = mockGitHub(200, { access_token: 'gho_token' });

    const response = await get('/callback?code=abc&state=s1', 'other=1; kh_oauth_state=s1');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://app.kaihuman.com/?access_token=gho_token',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Set-Cookie')).toContain('kh_oauth_state=; Max-Age=0');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      code: 'abc',
      redirect_uri: `${BASE}/callback`,
    });
  });

  it('rejects a state that does not match the cookie', async () => {
    const fetchMock = mockGitHub(200, { access_token: 'gho_token' });

    const response = await get('/callback?code=abc&state=forged', 'kh_oauth_state=s1');

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a callback without a state cookie', async () => {
    mockGitHub(200, { access_token: 'gho_token' });

    const response = await get('/callback?code=abc&state=s1');

    expect(response.status).toBe(400);
  });

  it('rejects a callback without a code', async () => {
    const response = await get('/callback?state=s1', 'kh_oauth_state=s1');

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Missing code');
  });

  it('reports an error GitHub sent back, e.g. when the user cancels', async () => {
    const response = await get('/callback?error=access_denied&state=s1', 'kh_oauth_state=s1');

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('access_denied');
  });

  it('reports a code GitHub refuses', async () => {
    mockGitHub(200, { error: 'bad_verification_code' });

    const response = await get('/callback?code=old&state=s1', 'kh_oauth_state=s1');

    expect(response.status).toBe(502);
    expect(await response.text()).toContain('bad_verification_code');
  });

  it('reports a failed token request', async () => {
    mockGitHub(500, {});

    const response = await get('/callback?code=abc&state=s1', 'kh_oauth_state=s1');

    expect(response.status).toBe(502);
  });
});

describe('expiring (GitHub App) tokens', () => {
  const pair = {
    access_token: 'ghu_access',
    refresh_token: 'ghr_refresh',
    expires_in: 28800,
    refresh_token_expires_in: 15897600,
  };

  it('passes the refresh token and expiry to the app with the access token', async () => {
    // Regression: only access_token was forwarded, so the session died when it expired after 8 h.
    mockGitHub(200, { ...pair, token_type: 'bearer', scope: '' });

    const response = await get('/callback?code=abc&state=s1:mobile', 'kh_oauth_state=s1:mobile');

    const location = new URL(response.headers.get('Location') ?? '');
    expect(location.searchParams.get('access_token')).toBe('ghu_access');
    expect(location.searchParams.get('refresh_token')).toBe('ghr_refresh');
    expect(location.searchParams.get('expires_in')).toBe('28800');
    expect(location.searchParams.get('refresh_token_expires_in')).toBe('15897600');
    expect(location.searchParams.has('token_type')).toBe(false);
  });

  function postRefresh(body: unknown): Promise<Response> {
    return worker.fetch(
      new Request(`${BASE}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it('trades a refresh token for a new pair', async () => {
    const fetchMock = mockGitHub(200, pair);

    const response = await postRefresh({ refresh_token: 'ghr_old' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(pair);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'refresh_token',
      refresh_token: 'ghr_old',
    });
  });

  it('answers 401 for a refresh token GitHub rejects', async () => {
    mockGitHub(200, { error: 'bad_refresh_token' });
    const response = await postRefresh({ refresh_token: 'ghr_used' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'bad_refresh_token' });
  });

  it('answers 502 when GitHub fails or the worker is misconfigured', async () => {
    mockGitHub(500, {});
    expect((await postRefresh({ refresh_token: 'r' })).status).toBe(502);
    mockGitHub(200, { error: 'incorrect_client_credentials' });
    expect((await postRefresh({ refresh_token: 'r' })).status).toBe(502);
  });

  it('rejects a request without a refresh token, and other methods', async () => {
    const fetchMock = mockGitHub(200, pair);
    expect((await postRefresh({})).status).toBe(400);
    expect((await get('/refresh')).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('other requests', () => {
  it('returns 404 for unknown paths', async () => {
    expect((await get('/gh/login')).status).toBe(404);
  });

  it('returns 405 for other methods', async () => {
    const response = await worker.fetch(new Request(`${BASE}/login`, { method: 'POST' }), env);
    expect(response.status).toBe(405);
  });
});
