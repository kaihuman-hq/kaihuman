/// <reference types="vite/client" />
import { computed, effect, signal } from '@preact/signals';
import { z } from 'zod';
import { dbPromise } from '../db.js';
import { demoMode } from '../demo-mode.js';
import { Logger } from '../logger.js';

const logger = new Logger('AuthStore');

const GithubProfileSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string(),
});

export type GithubProfile = z.infer<typeof GithubProfileSchema>;

const STORAGE_KEY_TOKEN = 'lifeos_gh_token';

export class AuthStore {
  // Signals
  token = signal<string | null>(localStorage.getItem(STORAGE_KEY_TOKEN));
  user = signal<GithubProfile | null>(null);
  isAuthenticated = computed(() => !!this.token.value);

  constructor() {
    this.init();
  }

  private async init() {
    const db = await dbPromise;

    // Check for explicit logout flag
    const loggedOut = localStorage.getItem('lifeos_logged_out');

    if (loggedOut) {
      // We were explicitly logged out, so ignore any token in DB to prevent zombie sessions
      await db.delete('auth', 'token');
      await db.delete('auth', 'user');
      // We can clear the flag now, or keep it. Clearing it is safe as we've nuked the DB token.
      localStorage.removeItem('lifeos_logged_out');

      // Clear legacy
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    } else {
      const token = await db.get('auth', 'token');
      const user = await db.get('auth', 'user');

      // Only restore from DB if handleCallback() hasn't already set a fresh token.
      // handleCallback() runs synchronously during render (before this async resumes),
      // so a non-null token here means we already have something fresher than the DB.
      if (token && !this.token.value) this.token.value = token;
      if (user) this.user.value = user;

      // Fallback to localStorage if DB empty (migration path)
      if (!this.token.value && localStorage.getItem(STORAGE_KEY_TOKEN)) {
        this.token.value = localStorage.getItem(STORAGE_KEY_TOKEN);
      }
    }

    // Persist token to DB on change
    effect(() => {
      const saveToken = async () => {
        // Demo sessions are ephemeral — never persist the fake token.
        if (demoMode.value) return;
        const db = await dbPromise;
        if (this.token.value) {
          // Keep localStorage as backup/sync for now, but primary source is DB for local-first
          localStorage.setItem(STORAGE_KEY_TOKEN, this.token.value);
          await db.put('auth', this.token.value, 'token');
        } else {
          localStorage.removeItem(STORAGE_KEY_TOKEN);
          await db.delete('auth', 'token');
        }
      };
      saveToken();
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
        const db = await dbPromise;
        if (this.user.value) {
          await db.put('auth', this.user.value, 'user');
        } else {
          await db.delete('auth', 'user');
        }
      };
      saveUser();
    });
  }

  login() {
    const gatewayUrl = import.meta.env.VITE_GH_LOGIN;
    if (!gatewayUrl) {
      logger.error('VITE_GH_LOGIN is not defined');
      return;
    }
    window.location.href = gatewayUrl;
  }

  logout() {
    // 1. Set explicit logout flag immediately
    localStorage.setItem('lifeos_logged_out', 'true');

    // 2. Immediate sync cleanup to prevent loop if a reload happens
    localStorage.removeItem(STORAGE_KEY_TOKEN);

    // 3. Update state - this triggers the effect to clean DB, and updates UI
    this.token.value = null;
    this.user.value = null;

    // 4. Do NOT force reload. ProtectedRoute checks isAuthenticated and will show Login.
  }

  /** Seed an in-memory session for demo mode. Relies on `demoMode` already being
   * true so the persistence effects skip writing the fake credentials. */
  enterDemo(user: GithubProfile) {
    localStorage.removeItem('lifeos_logged_out');
    this.user.value = user;
    this.token.value = 'demo-token';
  }

  /** Clear the in-memory demo session. */
  exitDemo() {
    this.token.value = null;
    this.user.value = null;
  }

  handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');

    if (accessToken) {
      // Clear logout flag on successful login
      localStorage.removeItem('lifeos_logged_out');

      this.token.value = accessToken;
      // Clear query param
      window.history.replaceState({}, document.title, window.location.pathname);
      return true;
    }
    return false;
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
        if (res.status === 401) {
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
