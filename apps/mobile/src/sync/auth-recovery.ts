import { signal } from '@preact/signals';
import type { RefreshOutcome } from './token-refresh.js';

/** What GitHub says about a token: `unknown` when it could not be asked (offline, 5xx). */
export type TokenCheck = 'valid' | 'invalid' | 'unknown';

/**
 * `valid`: the current token works, the failure was transient. `replaced`: another stored copy
 * works and is now the session's. `signed-out`: no copy works, the user must sign in again.
 */
export type AuthRecovery = 'valid' | 'replaced' | 'signed-out' | 'unknown';

/** Shown on the login screen after a session ended because GitHub rejected its token. */
export const sessionNotice = signal<string | null>(null);

export const SESSION_EXPIRED =
  'GitHub no longer accepts this sign-in (it expired or was revoked). Sign in again to keep syncing.';

/** GitHub's 401 body is "Bad credentials"; Octokit and the stores pass that message on. */
export function isAuthFailure(message: string | null | undefined): boolean {
  return !!message && /bad credentials|requires authentication|\b401\b/i.test(message);
}

export interface AuthRecoveryDeps {
  token(): string | null;
  /** Other stored copies of the token (Keychain, core's auth record); may repeat or be null. */
  candidates(): Promise<ReadonlyArray<string | null | undefined>>;
  check(token: string): Promise<TokenCheck>;
  adopt(token: string): void;
  signOut(): void;
  /** Trades the refresh token for a new access token (expiring GitHub App tokens). */
  refresh?(): Promise<RefreshOutcome>;
}

/**
 * Runs after a sync failed with a 401. The session's token is asked first, so a valid one never
 * ends in an error banner; a rejected one is replaced by a stored copy GitHub still accepts, or
 * the session ends with a notice instead of a banner that only logout + login cleared.
 */
export async function recoverAuth(deps: AuthRecoveryDeps): Promise<AuthRecovery> {
  const current = deps.token();
  if (!current) return 'signed-out';
  const verdict = await deps.check(current);
  if (verdict !== 'invalid') return verdict;
  // An expired access token is the normal end of its 8 hours, not of the session.
  const renewed = deps.refresh ? await deps.refresh().catch(() => 'unknown' as const) : 'none';
  if (renewed === 'refreshed') return 'replaced';
  const others = await deps.candidates().catch(() => []);
  for (const candidate of new Set(others)) {
    if (!candidate || candidate === current) continue;
    if ((await deps.check(candidate)) === 'valid') {
      deps.adopt(candidate);
      return 'replaced';
    }
  }
  // Another sign-in may have replaced the token meanwhile; that one is not ours to end.
  if (deps.token() !== current) return 'replaced';
  // The refresh token may still work once the auth service is reachable again.
  if (renewed === 'unknown') return 'unknown';
  sessionNotice.value = SESSION_EXPIRED;
  deps.signOut();
  return 'signed-out';
}

/** Asks GitHub whether `token` is accepted. */
export async function checkGithubToken(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<TokenCheck> {
  try {
    const res = await fetchFn('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (res.ok) return 'valid';
    return res.status === 401 ? 'invalid' : 'unknown';
  } catch {
    return 'unknown';
  }
}
