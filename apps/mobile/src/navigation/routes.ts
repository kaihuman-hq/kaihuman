import { isIdeaStatus } from '@kaihuman/formats';
import { isScanKind, type ScanKind } from '../intelligence/scan-kinds.js';

export const APP_SCHEME = 'kaihuman';

/** `inbox` is the one-field sheet behind the widget "+": it adds a plain todo to the inbox. */
export type QuickKind = 'todo' | 'note' | 'log' | 'idea' | 'knowledge' | 'inbox';

export type Route =
  | { name: 'auth-callback'; accessToken: string | null }
  /** `idea` (log only) targets that idea's log instead of the action log. */
  | { name: 'quick-capture'; kind: QuickKind; idea?: string }
  | { name: 'ideas'; status?: string }
  | { name: 'board'; milestone?: string; item?: string }
  | { name: 'inbox' }
  | { name: 'demo' }
  | { name: 'search'; q?: string }
  | { name: 'file'; path: string }
  /** Home-screen quick action "Today": the dashboard. */
  | { name: 'today' }
  /** The capture tab's kind picker (Control Center "Capture"). */
  | { name: 'capture' }
  /** Scan to entry; Visual Intelligence passes the recognised text and the picked kind. */
  | { name: 'scan'; kind?: ScanKind; text?: string }
  | { name: 'weekly-review' };

const QUICK_KINDS: readonly QuickKind[] = ['todo', 'note', 'log', 'idea', 'knowledge', 'inbox'];

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
  const param = (key: string) => parsed.searchParams.get(key) || undefined;
  if (head === 'board' && rest.length === 0) {
    const milestone = param('milestone');
    const item = param('item');
    return { name: 'board', ...(milestone && { milestone }), ...(item && { item }) };
  }
  if (head === 'ideas' && rest.length === 0) {
    const status = param('status');
    const known = status && (isIdeaStatus(status) || status === 'open' || status === 'all');
    return { name: 'ideas', ...(known && { status }) };
  }
  if (head === 'inbox' && rest.length === 0) return { name: 'inbox' };
  if (head === 'today' && rest.length === 0) return { name: 'today' };
  if (head === 'capture' && rest.length === 0) return { name: 'capture' };
  if (head === 'weekly-review' && rest.length === 0) return { name: 'weekly-review' };
  if (head === 'scan' && rest.length === 0) {
    const kind = param('kind');
    const text = param('text');
    return { name: 'scan', ...(isScanKind(kind) && { kind }), ...(text && { text }) };
  }
  // Non-interactive "Try demo" (used by CI screenshots).
  if (head === 'demo' && rest.length === 0) return { name: 'demo' };
  if (head === 'search' && rest.length === 0) {
    const q = param('q');
    return { name: 'search', ...(q && { q }) };
  }
  if (head === 'files' && rest.length > 0) {
    try {
      return { name: 'file', path: rest.map(decodeURIComponent).join('/') };
    } catch {
      return null;
    }
  }
  const kind = head?.startsWith('quick-') ? head.slice('quick-'.length) : undefined;
  if (rest.length === 0 && kind && (QUICK_KINDS as readonly string[]).includes(kind)) {
    const idea = kind === 'log' ? param('idea') : undefined;
    return { name: 'quick-capture', kind: kind as QuickKind, ...(idea && { idea }) };
  }
  return null;
}

const withQuery = (base: string, params: Record<string, string | undefined>): string => {
  const query = Object.entries(params)
    .flatMap(([k, v]) => (v ? [`${k}=${encodeURIComponent(v)}`] : []))
    .join('&');
  return query ? `${base}?${query}` : base;
};

/** Shared by `routeToUrl` and the expo-router href mapping so params are encoded one way. */
export const routeQuery = withQuery;

export const routeToUrl = (route: Exclude<Route, { name: 'auth-callback' }>): string => {
  switch (route.name) {
    case 'quick-capture':
      return withQuery(`${APP_SCHEME}://quick-${route.kind}`, { idea: route.idea });
    case 'ideas':
      return withQuery(`${APP_SCHEME}://ideas`, { status: route.status });
    case 'board':
      return withQuery(`${APP_SCHEME}://board`, { milestone: route.milestone, item: route.item });
    case 'inbox':
      return `${APP_SCHEME}://inbox`;
    case 'demo':
      return `${APP_SCHEME}://demo`;
    case 'search':
      return withQuery(`${APP_SCHEME}://search`, { q: route.q });
    case 'file':
      return `${APP_SCHEME}://files/${route.path.split('/').map(encodeURIComponent).join('/')}`;
    case 'today':
      return `${APP_SCHEME}://today`;
    case 'capture':
      return `${APP_SCHEME}://capture`;
    case 'scan':
      return withQuery(`${APP_SCHEME}://scan`, { kind: route.kind, text: route.text });
    case 'weekly-review':
      return `${APP_SCHEME}://weekly-review`;
  }
};
