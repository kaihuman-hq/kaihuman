export const APP_SCHEME = 'kaihuman';

export type QuickKind = 'todo' | 'note' | 'log' | 'idea' | 'knowledge';

export type Route =
  | { name: 'auth-callback'; accessToken: string | null }
  | { name: 'quick-capture'; kind: QuickKind }
  | { name: 'board' }
  | { name: 'demo' }
  | { name: 'file'; path: string };

const QUICK_KINDS: readonly QuickKind[] = ['todo', 'note', 'log', 'idea', 'knowledge'];

/**
 * Parses `kaihuman://...` deep links. Returns null for foreign schemes and unknown routes
 * so callers can ignore them instead of navigating to a dead end.
 */
export function parseDeepLink(url: string): Route | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_SCHEME}:`) return null;

  // In `kaihuman://auth/callback` the first segment is the host.
  const segments = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)].filter(Boolean);
  const [head, ...rest] = segments;

  if (head === 'auth' && rest[0] === 'callback') {
    return { name: 'auth-callback', accessToken: parsed.searchParams.get('access_token') };
  }
  if (head === 'board' && rest.length === 0) return { name: 'board' };
  // Non-interactive "Try demo" (used by CI screenshots).
  if (head === 'demo' && rest.length === 0) return { name: 'demo' };
  if (head === 'files' && rest.length > 0) {
    try {
      return { name: 'file', path: rest.map(decodeURIComponent).join('/') };
    } catch {
      return null;
    }
  }
  const kind = head?.startsWith('quick-') ? head.slice('quick-'.length) : undefined;
  if (rest.length === 0 && kind && (QUICK_KINDS as readonly string[]).includes(kind)) {
    return { name: 'quick-capture', kind: kind as QuickKind };
  }
  return null;
}

export const routeToUrl = (route: Exclude<Route, { name: 'auth-callback' }>): string => {
  switch (route.name) {
    case 'quick-capture':
      return `${APP_SCHEME}://quick-${route.kind}`;
    case 'board':
      return `${APP_SCHEME}://board`;
    case 'demo':
      return `${APP_SCHEME}://demo`;
    case 'file':
      return `${APP_SCHEME}://files/${route.path.split('/').map(encodeURIComponent).join('/')}`;
  }
};
