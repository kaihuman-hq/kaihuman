/**
 * A worker under test: fake D1 and R2, production limits, a movable clock and a stubbed
 * GitHub `/user` endpoint that maps bearer tokens to user ids.
 */

import { vi } from 'vitest';
import { clearAuthCache } from '../auth.js';
import type { Env } from '../env.js';
import { handle } from '../index.js';
import { FakeD1, FakeR2 } from './fakes.js';

export const BASE = 'https://docs.kaihuman.com';
export const CONSOLE = 'https://app.kaihuman.com';

/** Bearer tokens the GitHub stub knows. `gho_down` makes GitHub answer 500. */
export const USERS = { gho_alice: 101, gho_bob: 202 } as const;
export type UserToken = keyof typeof USERS | 'gho_down' | 'gho_unknown';

export interface CallOptions {
  token?: UserToken | null;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

export function makeWorld() {
  clearAuthCache();
  const db = new FakeD1();
  const files = new FakeR2();
  const env: Env = {
    DB: db,
    FILES: files,
    CONSOLE_ORIGINS: `${CONSOLE}, http://localhost:4300`,
    QUOTA_BYTES: '524288000',
    MAX_BYTES: '10485760',
    UPLOADS_PER_HOUR: '30',
    ABUSE_EMAIL: 'abuse@kaihuman.com',
  };
  const clock = { now: Date.parse('2026-11-02T10:00:00.000Z') };
  const gitHub = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    const token = auth.replace(/^Bearer /, '');
    if (token === 'gho_down') return new Response('boom', { status: 500 });
    const id = USERS[token as keyof typeof USERS];
    if (id === undefined) return Response.json({ message: 'Bad credentials' }, { status: 401 });
    return Response.json({ id, login: token.slice(4) });
  });

  function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
    const headers = new Headers({ Origin: CONSOLE, ...options.headers });
    const token = options.token === undefined ? 'gho_alice' : options.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const request = new Request(`${BASE}${path}`, {
      method,
      headers,
      body: options.body as BodyInit | undefined,
    });
    return handle(request, env, { fetch: gitHub as typeof fetch, now: () => clock.now });
  }

  /** Uploads `size` bytes (or the given body) with valid headers unless overridden. */
  function upload(
    size: number,
    options: Omit<CallOptions, 'body'> & { body?: Uint8Array } = {},
  ): Promise<Response> {
    return call('POST', '/api/files', {
      ...options,
      body: options.body ?? new Uint8Array(size).fill(7),
      headers: {
        'X-KH-Kind': 'pdf',
        'X-KH-Label': '2026-001.pdf',
        'X-KH-Business': 'Acme%20GmbH',
        ...options.headers,
      },
    });
  }

  return { db, files, env, clock, gitHub, call, upload };
}

export type World = ReturnType<typeof makeWorld>;
