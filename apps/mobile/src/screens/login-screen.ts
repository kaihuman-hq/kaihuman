import { authStore, enterDemoMode } from '@kaihuman/core';
import { APP_SCHEME, parseDeepLink } from '../navigation/routes.js';

/** Where the auth-worker sends the browser when `client=mobile`; the auth session watches for it. */
export const AUTH_CALLBACK_URL = `${APP_SCHEME}://auth/callback`;

/** Structural subset of expo-web-browser's `WebBrowserAuthSessionResult`. */
export type AuthSessionResult =
  | { type: 'success'; url: string }
  | { type: 'cancel' | 'dismiss' | 'locked' | 'opened' };

export type BrowserAuthOutcome = 'signed-in' | 'cancelled' | 'no-token';

export type OpenAuthSession = (url: string, redirectUrl: string) => Promise<AuthSessionResult>;

/** Login view-model. `gatewayUrl` is the auth-worker `/login` endpoint. */
export class LoginScreenController {
  constructor(private readonly gatewayUrl: string) {}

  /** URL to open in the system browser; `client=mobile` makes the worker redirect to the app scheme. */
  buildLoginUrl(): string {
    const url = new URL(this.gatewayUrl);
    url.searchParams.set('client', 'mobile');
    return url.toString();
  }

  /** Handles `kaihuman://auth/callback?access_token=...`. True when a token was accepted. */
  handleDeepLink(url: string): boolean {
    return parseDeepLink(url)?.name === 'auth-callback' && authStore.handleCallbackUrl(url);
  }

  /** Feeds an auth-session result into the same path as the deep-link handler. */
  handleAuthResult(result: AuthSessionResult): BrowserAuthOutcome {
    if (result.type !== 'success') return 'cancelled';
    return this.handleDeepLink(result.url) ? 'signed-in' : 'no-token';
  }

  async signInWithBrowser(open: OpenAuthSession): Promise<BrowserAuthOutcome> {
    return this.handleAuthResult(await open(this.buildLoginUrl(), AUTH_CALLBACK_URL));
  }

  /** Sign in with a personal access token; blank input is rejected. */
  signInWithToken(token: string): boolean {
    const trimmed = token.trim();
    if (!trimmed) return false;
    authStore.token.value = trimmed;
    return true;
  }

  enterDemo(): void {
    enterDemoMode();
  }
}
