import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authUser, clearAuthCache } from './auth.js';
import type { Env } from './env.js';

const env = {} as Env;

function request(authorization?: string): Request {
  const headers = authorization ? { Authorization: authorization } : undefined;
  return new Request('https://docs.kaihuman.com/api/files', { headers });
}

function gitHub(status: number, body: unknown = {}) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
}

async function errorOf(result: { id: number } | Response): Promise<[number, string]> {
  expect(result).toBeInstanceOf(Response);
  const response = result as Response;
  return [response.status, ((await response.json()) as { error: string }).error];
}

beforeEach(() => clearAuthCache());

describe('authUser', () => {
  it('asks GitHub for the user with the token and a User-Agent', async () => {
    const fetchMock = gitHub(200, { id: 42, login: 'octo' });

    expect(await authUser(request('Bearer gho_abc'), env, fetchMock)).toEqual({ id: 42 });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.github.com/user');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer gho_abc');
    expect(headers.get('User-Agent')).toBeTruthy();
  });

  it.each([
    undefined,
    'gho_abc',
    'Basic Zm9vOmJhcg==',
    'Bearer ',
    'Bearer a b',
  ])('refuses a missing or malformed header %s without calling GitHub', async (header) => {
    const fetchMock = gitHub(200, { id: 42 });
    expect(await errorOf(await authUser(request(header), env, fetchMock))).toEqual([
      401,
      'Sign in to kaihuman again.',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a GitHub 401 to 401', async () => {
    expect(await errorOf(await authUser(request('Bearer old'), env, gitHub(401)))).toEqual([
      401,
      'Sign in to kaihuman again.',
    ]);
  });

  it.each([500, 403, 404])('maps GitHub %i to 502', async (status) => {
    expect(await errorOf(await authUser(request('Bearer t'), env, gitHub(status)))).toEqual([
      502,
      'GitHub is not reachable.',
    ]);
  });

  it('maps a network error or a body without an id to 502', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect((await errorOf(await authUser(request('Bearer t'), env, down)))[0]).toBe(502);
    expect((await errorOf(await authUser(request('Bearer t'), env, gitHub(200, {}))))[0]).toBe(502);
  });

  it('caches a user for 5 minutes, then asks GitHub again', async () => {
    let now = 1_000_000;
    const fetchMock = gitHub(200, { id: 7 });
    const clock = () => now;

    await authUser(request('Bearer gho_c'), env, fetchMock, clock);
    now += 5 * 60_000 - 1;
    expect(await authUser(request('Bearer gho_c'), env, fetchMock, clock)).toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 1;
    await authUser(request('Bearer gho_c'), env, fetchMock, clock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keys the cache by token', async () => {
    const ok = gitHub(200, { id: 7 });
    await authUser(request('Bearer one'), env, ok);
    await authUser(request('Bearer two'), env, ok);
    expect(ok).toHaveBeenCalledTimes(2);
  });

  it('remembers a token GitHub refused for 60 seconds', async () => {
    let now = 1_000_000;
    const clock = () => now;
    const refused = gitHub(401);

    await authUser(request('Bearer garbage'), env, refused, clock);
    now += 60_000 - 1;
    expect(await errorOf(await authUser(request('Bearer garbage'), env, refused, clock))).toEqual([
      401,
      'Sign in to kaihuman again.',
    ]);
    expect(refused).toHaveBeenCalledTimes(1);

    now += 1;
    await authUser(request('Bearer garbage'), env, refused, clock);
    expect(refused).toHaveBeenCalledTimes(2);
  });

  it('does not cache GitHub outages', async () => {
    const down = gitHub(500);
    await authUser(request('Bearer t'), env, down);
    await authUser(request('Bearer t'), env, down);
    expect(down).toHaveBeenCalledTimes(2);
  });

  it('keeps both caches bounded', async () => {
    const refused = gitHub(401);
    for (let i = 0; i < 1001; i++) await authUser(request(`Bearer bad${i}`), env, refused);
    // The first entry was evicted to make room, so GitHub is asked again.
    await authUser(request('Bearer bad0'), env, refused);
    expect(refused).toHaveBeenCalledTimes(1002);
  });
});
