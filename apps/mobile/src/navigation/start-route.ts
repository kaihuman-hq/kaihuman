/** Where the app should be, given only what is persisted. The one place that decision lives. */
export type StartRoute = '/login' | '/onboarding' | '/dashboard';

export interface SessionState {
  token: string | null;
  repo: unknown | null;
}

export function resolveStartRoute({ token, repo }: SessionState): StartRoute {
  if (!token) return '/login';
  return repo ? '/dashboard' : '/onboarding';
}

/**
 * Redirect for the root layout, or null to stay. First-run screens are left once their job is done;
 * app screens are left when the session is lost. `segment` is the top-level route segment.
 */
export function guardRedirect(state: SessionState, segment: string | undefined): StartRoute | null {
  if (segment === undefined) return null;
  const target = resolveStartRoute(state);
  const own = target === '/login' ? 'login' : target === '/onboarding' ? 'onboarding' : null;
  if (segment === own) return null;
  // `auth` is the deep-link callback route, which redirects on its own.
  if (segment === 'auth') return null;
  const firstRun = segment === 'login' || segment === 'onboarding';
  // Signed-in app screens stay put; everything else follows the session.
  return target === '/dashboard' && !firstRun ? null : target;
}

export interface RepoLike {
  full_name: string;
  name: string;
  updated_at: string;
  pushed_at?: string | null;
}

const stamp = (r: RepoLike) => Date.parse(r.pushed_at ?? r.updated_at) || 0;

export const sortByRecentPush = <T extends RepoLike>(repos: readonly T[]): T[] =>
  [...repos].sort((a, b) => stamp(b) - stamp(a));

// A Life OS repo is not detectable from the list call; the name is the cheap signal.
const PLAUSIBLE = /kaihuman|life-?os|(^|[-_.])kh($|[-_.])/i;

/** The single plausible repo to pre-pick, or null when there are none or several. */
export function pickPreselect<T extends RepoLike>(repos: readonly T[]): T | null {
  const hits = repos.filter((r) => PLAUSIBLE.test(r.name));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

export function filterRepos<T extends RepoLike>(repos: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : [...repos];
}
