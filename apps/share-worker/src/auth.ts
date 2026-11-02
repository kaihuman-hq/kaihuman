/**
 * Identifies the caller by their GitHub token. The token is sent only to GitHub, never logged
 * or stored; the cache holds its SHA-256 so a memory dump does not reveal it.
 */

import type { Env } from './env.js';
import { error } from './respond.js';

const CACHE_MS = 5 * 60_000;
const CACHE_LIMIT = 1000;
const SIGN_IN_AGAIN = 'Sign in to kaihuman again.';
const GITHUB_DOWN = 'GitHub is not reachable.';

const cache = new Map<string, { id: number; until: number }>();

/** For tests: the cache lives in module memory, as it does per isolate in production. */
export function clearAuthCache(): void {
  cache.clear();
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function bearer(request: Request): string | null {
  const match = /^Bearer ([^\s]{1,512})$/.exec(request.headers.get('Authorization') ?? '');
  return match?.[1] ?? null;
}

function remember(key: string, id: number, now: number): void {
  if (cache.size >= CACHE_LIMIT) {
    for (const [k, entry] of cache) if (entry.until <= now) cache.delete(k);
    // Still full of live entries: drop the oldest rather than grow without bound.
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, { id, until: now + CACHE_MS });
}

export async function authUser(
  request: Request,
  _env: Env,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<{ id: number } | Response> {
  const token = bearer(request);
  if (!token) return error(SIGN_IN_AGAIN, 401);

  const key = await sha256(token);
  const cached = cache.get(key);
  if (cached && cached.until > now()) return { id: cached.id };

  let response: Response;
  try {
    response = await fetchImpl('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'kaihuman-share',
      },
    });
  } catch {
    return error(GITHUB_DOWN, 502);
  }
  if (response.status === 401) return error(SIGN_IN_AGAIN, 401);
  if (!response.ok) return error(GITHUB_DOWN, 502);

  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  const id = body?.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) return error(GITHUB_DOWN, 502);

  remember(key, id, now());
  return { id };
}
