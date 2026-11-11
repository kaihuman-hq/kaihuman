/// <reference types="vite/client" />
import { batch, computed, effect, signal } from '@preact/signals';
import { z } from 'zod';
import { demoMode } from '../demo-mode.js';
import { viteEnv } from '../env.js';
import { Logger } from '../logger.js';
import { getCoreStorage } from '../storage/adapter.js';

const logger = new Logger('AuthStore');

const GithubProfileSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string(),
});

export type GithubProfile = z.infer<typeof GithubProfileSchema>;

const STORAGE_KEY_TOKEN = 'lifeos_gh_token';
const REFRESH_RECORD = 'refresh';

/** Expiring GitHub App user tokens: the access token lasts hours, the refresh token months. */
interface RefreshRecord {
  refreshToken: string;
  /** Epoch ms when the access token expires; null when GitHub did not say. */
  expiresAt: number | null;
}

/** A sign-in or refresh result. Without `refreshToken` the token is treated as non-expiring. */
export interface AuthSession {
  accessToken: string;
  refreshToken?: string | null;
  /** Seconds until `accessToken` expires, as GitHub's `expires_in`. */
  expiresIn?: number | null;
}

export class AuthStore {
  // Signals
  token = signal<string | null>(getCoreStorage().getItem(STORAGE_KEY_TOKEN));
  user = signal<GithubProfile | null>(null);
  /** Present only for expiring tokens; rotated on every refresh, so always persist the latest. */
  refreshToken = signal<string | null>(null);
  /** Epoch ms when `token` expires, or null when it does not (OAuth app tokens, PATs). */
  tokenExpiresAt = signal<number | null>(null);
  isAuthenticated = computed(() => !!this.token.value);
  /** Resolves once persisted auth state (token, profile, refresh token) has been restored. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    const db = getCoreStorage();

    // Check for explicit logout flag
    const loggedOut = getCoreStorage().getItem('lifeos_logged_out');

    if (loggedOut) {
      // We were explicitly logged out, so ignore any token in DB to prevent zombie sessions
      await db.deleteRecord('auth', 'token');
      await db.deleteRecord('auth', 'user');
      await db.deleteRecord('auth', REFRESH_RECORD);
      // We can clear the flag now, or keep it. Clearing it is safe as we've nuked the DB token.
      getCoreStorage().removeItem('lifeos_logged_out');

      // Clear legacy
      getCoreStorage().removeItem(STORAGE_KEY_TOKEN);
    } else {
      const token = await db.getRecord<string>('auth', 'token');
      const user = await db.getRecord<GithubProfile>('auth', 'user');
      const refresh = await db.getRecord<RefreshRecord>('auth', REFRESH_RECORD);

      // Only restore from DB if handleCallback() hasn't already set a fresh token.
      // handleCallback() runs synchronously during render (before this async resumes),
      // so a non-null token here means we already have something fresher than the DB.
      if (token && !this.token.value) this.token.value = token;
      if (user) this.user.value = user;
      // The refresh token belongs to the persisted access token; a fresher callback token owns its own.
      const persisted = token ?? getCoreStorage().getItem(STORAGE_KEY_TOKEN);
      if (refresh?.refreshToken && persisted && this.token.value === persisted) {
        this.refreshToken.value = refresh.refreshToken;
        this.tokenExpiresAt.value = refresh.expiresAt ?? null;
      }

      // Fallback to localStorage if DB empty (migration path)
      if (!this.token.value && getCoreStorage().getItem(STORAGE_KEY_TOKEN)) {
        this.token.value = getCoreStorage().getItem(STORAGE_KEY_TOKEN);
      }
    }

    // Persist token to DB on change
    effect(() => {
      const saveToken = async () => {
        // Demo sessions are ephemeral — never persist the fake token.
        if (demoMode.value) return;
        const db = getCoreStorage();
        if (this.token.value) {
          // Keep localStorage as backup/sync for now, but primary source is DB for local-first
          getCoreStorage().setItem(STORAGE_KEY_TOKEN, this.token.value);
          await db.putRecord('auth', 'token', this.token.value);
        } else {
          getCoreStorage().removeItem(STORAGE_KEY_TOKEN);
          await db.deleteRecord('auth', 'token');
        }
      };
      saveToken();
    });

    // Without the refresh token an expiring session ends hours after sign-in.
    effect(() => {
      const refreshToken = this.refreshToken.value;
      const expiresAt = this.tokenExpiresAt.value;
      if (demoMode.value) return;
      const db = getCoreStorage();
      void (
        refreshToken
          ? db.putRecord('auth', REFRESH_RECORD, {
              refreshToken,
              expiresAt,
            } satisfies RefreshRecord)
          : db.deleteRecord('auth', REFRESH_RECORD)
      ).catch((err: unknown) => logger.error('Failed to persist refresh token:', err));
    });

    // Fetch user if token exists but user is missing (restore session)
    effect(() => {
      if (this.token.value && !this.user.value) {
        this.fetchUser();
      }
    });

    // Persist user profile
    effect(() => {
      const saveUser = async () => {
        if (demoMode.value) return;
        const db = getCoreStorage();
        if (this.user.value) {
          await db.putRecord('auth', 'user', this.user.value);
        } else {
          await db.deleteRecord('auth', 'user');
        }
      };
      saveUser();
    });
  }

  login() {
    const gatewayUrl = viteEnv(import.meta).VITE_GH_LOGIN;
    if (!gatewayUrl) {
      logger.error('VITE_GH_LOGIN is not defined');
      return;
    }
    if (typeof window === 'undefined') {
      logger.error('login() requires a browser; open the gateway URL natively');
      return;
    }
    window.location.href = gatewayUrl;
  }

  logout() {
    // 1. Set explicit logout flag immediately
    getCoreStorage().setItem('lifeos_logged_out', 'true');

    // 2. Immediate sync cleanup to prevent loop if a reload happens
    getCoreStorage().removeItem(STORAGE_KEY_TOKEN);

    // 3. Update state - this triggers the effect to clean DB, and updates UI
    this.token.value = null;
    this.user.value = null;
    this.refreshToken.value = null;
    this.tokenExpiresAt.value = null;

    // 4. Do NOT force reload. ProtectedRoute checks isAuthenticated and will show Login.
  }

  /** Seed an in-memory session for demo mode. Relies on `demoMode` already being
   * true so the persistence effects skip writing the fake credentials. */
  enterDemo(user: GithubProfile) {
    getCoreStorage().removeItem('lifeos_logged_out');
    this.user.value = user;
    this.token.value = 'demo-token';
  }

  /** Clear the in-memory demo session. */
  exitDemo() {
    this.token.value = null;
    this.user.value = null;
  }

  handleCallback() {
    if (typeof window === 'undefined') return false;
    const accepted = this.applyCallbackParams(new URLSearchParams(window.location.search));
    if (accepted) {
      // Clear query param
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return accepted;
  }

  /** Native/deep-link variant of handleCallback, e.g. `kaihuman://auth/callback?access_token=...`. */
  handleCallbackUrl(url: string): boolean {
    let params: URLSearchParams;
    try {
      params = new URL(url).searchParams;
    } catch {
      return false;
    }
    return this.applyCallbackParams(params);
  }

  private applyCallbackParams(params: URLSearchParams): boolean {
    const accessToken = params.get('access_token');
    if (!accessToken) return false;
    const expiresIn = Number(params.get('expires_in'));
    this.setSession({
      accessToken,
      refreshToken: params.get('refresh_token'),
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null,
    });
    return true;
  }

  /** Starts or renews a session; a session without a refresh token clears any earlier one. */
  setSession(session: AuthSession, now: number = Date.now()): void {
    // Clear logout flag on successful login
    getCoreStorage().removeItem('lifeos_logged_out');
    const refreshToken = session.refreshToken || null;
    batch(() => {
      this.refreshToken.value = refreshToken;
      this.tokenExpiresAt.value =
        refreshToken && session.expiresIn ? now + session.expiresIn * 1000 : null;
      this.token.value = session.accessToken;
    });
  }

  private async fetchUser() {
    if (!this.token.value) return;
    if (demoMode.value) return; // demo user is seeded directly, never fetched

    try {
      logger.debug('Fetching user with token:', `${this.token.value?.substring(0, 10)}...`);
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${this.token.value}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) {
        logger.error('Failed to fetch user:', res.status, res.statusText);
        // An expiring token that ran out is renewed with its refresh token by the app, not ended.
        if (res.status === 401 && !this.refreshToken.value) {
          logger.warn('Token invalid, logging out.');
          this.logout();
        }
        throw new Error('Failed to fetch user');
      }

      const data = await res.json();
      this.user.value = GithubProfileSchema.parse(data);
    } catch (err) {
      logger.error('Auth error:', err);
    }
  }
}

export const authStore = new AuthStore();
