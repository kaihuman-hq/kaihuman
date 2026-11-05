import { authStore, enterDemoMode } from '@kaihuman/core';
import { parseDeepLink } from '../navigation/routes.js';

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
