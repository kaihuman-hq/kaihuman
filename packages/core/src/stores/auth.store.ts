import { computed, effect, signal } from '@preact/signals';
import { z } from 'zod';

const GithubProfileSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string(),
});

export type GithubProfile = z.infer<typeof GithubProfileSchema>;

const STORAGE_KEY_TOKEN = 'lifeos_gh_token';

class AuthStore {
  // Signals
  token = signal<string | null>(localStorage.getItem(STORAGE_KEY_TOKEN));
  user = signal<GithubProfile | null>(null);
  isAuthenticated = computed(() => !!this.token.value);

  constructor() {
    // Persist token
    effect(() => {
      if (this.token.value) {
        localStorage.setItem(STORAGE_KEY_TOKEN, this.token.value);
      } else {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
    });

    // Fetch user if token exists but user is missing (restore session)
    effect(() => {
      if (this.token.value && !this.user.value) {
        this.fetchUser();
      }
    });
  }

  login() {
    const gatewayUrl = import.meta.env.VITE_GH_LOGIN;
    if (!gatewayUrl) {
      console.error('VITE_GH_LOGIN is not defined');
      return;
    }
    window.location.href = gatewayUrl;
  }

  logout() {
    this.token.value = null;
    this.user.value = null;
    window.location.href = '/login';
  }

  handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');

    if (accessToken) {
      this.token.value = accessToken;
      // Clear query param
      window.history.replaceState({}, document.title, window.location.pathname);
      return true;
    }
    return false;
  }

  private async fetchUser() {
    if (!this.token.value) return;

    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${this.token.value}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) this.logout();
        throw new Error('Failed to fetch user');
      }

      const data = await res.json();
      this.user.value = GithubProfileSchema.parse(data);
    } catch (err) {
      console.error('Auth error:', err);
    }
  }
}

export const authStore = new AuthStore();
