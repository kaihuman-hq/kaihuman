import type { AuthSession } from '@kaihuman/core';

/**
 * `refreshed`: a new token pair is in place. `invalid`: the refresh token was rejected, the user
 * must sign in again. `unknown`: the auth service could not be asked. `none`: nothing to do (no
 * refresh token, or the token is not near expiry).
 */
export type RefreshOutcome = 'refreshed' | 'invalid' | 'unknown' | 'none';

/** Refresh this long before expiry, so a sync that starts just before it does not hit a 401. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface TokenRefreshDeps {
  /** The auth-worker's `/refresh` endpoint. */
  endpoint: string;
  session(): { refreshToken: string | null; expiresAt: number | null };
  save(session: AuthSession): void;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface TokenRefresher {
  /** Trades the refresh token for a new pair now. */
  refresh(): Promise<RefreshOutcome>;
  /** Refreshes only when the access token expires within `REFRESH_MARGIN_MS`. */
  ensureFresh(): Promise<RefreshOutcome>;
}

/** `https://auth.example.com/login` → `https://auth.example.com/refresh`. */
export function refreshEndpointFor(loginUrl: string): string {
  return new URL('/refresh', loginUrl).toString();
}

export function createTokenRefresher(deps: TokenRefreshDeps): TokenRefresher {
  const fetchFn = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  // GitHub rotates the refresh token: a second request with the same one would be rejected and
  // sign the user out, so concurrent callers (sync, foreground, 401 recovery) share one request.
  let inFlight: Promise<RefreshOutcome> | null = null;

  async function exchange(refreshToken: string): Promise<RefreshOutcome> {
    try {
      const res = await fetchFn(deps.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (res.status === 401 || res.status === 400) return 'invalid';
      if (!res.ok) return 'unknown';
      const body = (await res.json()) as {
        access_token?: unknown;
        refresh_token?: unknown;
        expires_in?: unknown;
      };
      if (typeof body.access_token !== 'string' || !body.access_token) return 'unknown';
      deps.save({
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
        expiresIn: typeof body.expires_in === 'number' ? body.expires_in : null,
      });
      return 'refreshed';
    } catch {
      return 'unknown';
    }
  }

  const refresh = (): Promise<RefreshOutcome> => {
    if (inFlight) return inFlight;
    const { refreshToken } = deps.session();
    if (!refreshToken) return Promise.resolve('none');
    inFlight = exchange(refreshToken).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  return {
    refresh,
    ensureFresh() {
      const { refreshToken, expiresAt } = deps.session();
      if (!refreshToken || expiresAt === null) return Promise.resolve('none');
      if (now() < expiresAt - REFRESH_MARGIN_MS) return Promise.resolve('none');
      return refresh();
    },
  };
}
