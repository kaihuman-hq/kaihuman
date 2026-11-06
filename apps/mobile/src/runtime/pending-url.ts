import { authStore, demoMode, enterDemoMode } from '@kaihuman/core';
import { parseDeepLink, type Route } from '../navigation/routes.js';

/** Enters demo mode unless already in it, so a deep link plus its route file do not reseed twice. */
export function enterDemoOnce(): void {
  if (!demoMode.value) enterDemoMode();
}

export const routeToHref = (route: Route): string => {
  switch (route.name) {
    case 'auth-callback':
      return '/';
    case 'quick-capture':
      return `/quick-${route.kind}`;
    case 'board':
    case 'inbox': // no dedicated inbox screen yet; the board lists inbox items
      return '/board';
    case 'demo':
      return '/dashboard';
    case 'file':
      return `/files/${route.path.split('/').map(encodeURIComponent).join('/')}`;
  }
};

/** Routes one incoming URL: sign-in callbacks go to the app root, unknown URLs are ignored. */
export function handleUrl(url: string, navigate: (href: string) => void): void {
  const route = parseDeepLink(url);
  if (!route) return;
  if (route.name === 'auth-callback' && !authStore.handleCallbackUrl(url)) return;
  if (route.name === 'demo') enterDemoOnce();
  navigate(routeToHref(route));
}

/** Consumes the URL a widget intent stored for us, if any. Returns true when one was routed. */
export function handlePendingUrl(
  consume: () => string | null,
  navigate: (href: string) => void,
): boolean {
  const url = consume();
  if (!url) return false;
  handleUrl(url, navigate);
  return true;
}

export interface LinkDeps {
  consumePendingUrl: () => string | null;
  getInitialUrl: () => Promise<string | null>;
  onUrl: (listener: (url: string) => void) => () => void;
  onForeground: (listener: () => void) => () => void;
  navigate: (href: string) => void;
}

export function startLinkHandling(deps: LinkDeps): () => void {
  const pending = () => handlePendingUrl(deps.consumePendingUrl, deps.navigate);
  pending();
  void deps.getInitialUrl().then((url) => {
    if (url) handleUrl(url, deps.navigate);
  });
  const offUrl = deps.onUrl((url) => handleUrl(url, deps.navigate));
  const offForeground = deps.onForeground(pending);
  return () => {
    offUrl();
    offForeground();
  };
}
