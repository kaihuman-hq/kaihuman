/**
 * Work streams: the URL helpers behind `.kh/streams.md` (doc/work-streams.md).
 * An item is identified by its normalised URL, so every spelling of one pull request
 * (trailing slash, `/files`, a fragment, `www.`) has to collapse to the same string.
 */

/** `owner/repo#number` with owner and repo lowercased — GitHub treats them case-insensitively. */
export type GithubKey = string & { readonly __brand: 'GithubKey' };

export type GithubRef = {
  kind: 'github-pr' | 'github-issue';
  owner: string;
  repo: string;
  number: number;
  key: GithubKey;
};

export type ItemRef = GithubRef | { kind: 'link'; host: string };

const GITHUB_HOSTS: readonly string[] = ['github.com', 'www.github.com'];
const GITHUB_PATH = /^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)(\/|$)/;
const TRACKING_PARAMS: readonly string[] = ['fbclid', 'gclid', 'mc_cid', 'mc_eid'];

export const githubKey = (owner: string, repo: string, number: number): GithubKey =>
  `${owner.toLowerCase()}/${repo.toLowerCase()}#${number}` as GithubKey;

const parseSafe = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    // Only web links are ever rendered as anchors; javascript: and file: must never get that far.
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
};

export const isSafeUrl = (url: string): boolean => parseSafe(url) !== null;

const githubRefOf = (url: URL): GithubRef | null => {
  if (!GITHUB_HOSTS.includes(url.hostname)) return null;
  const match = GITHUB_PATH.exec(url.pathname);
  if (!match) return null;
  const [, owner = '', repo = '', type, digits = ''] = match;
  const number = Number(digits);
  return {
    kind: type === 'pull' ? 'github-pr' : 'github-issue',
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    number,
    key: githubKey(owner, repo, number),
  };
};

/** What a URL points at, or `null` when it is unsafe or not a URL. */
export const itemRefOf = (url: string): ItemRef | null => {
  const parsed = parseSafe(url);
  if (!parsed) return null;
  return githubRefOf(parsed) ?? { kind: 'link', host: parsed.hostname };
};

const isTracking = (name: string) => name.startsWith('utm_') || TRACKING_PARAMS.includes(name);

/** The canonical spelling of an item's URL; unsafe URLs come back unchanged. */
export const normalizeItemUrl = (url: string): string => {
  const parsed = parseSafe(url);
  if (!parsed) return url;
  const ref = githubRefOf(parsed);
  if (ref) {
    const type = ref.kind === 'github-pr' ? 'pull' : 'issues';
    return `https://github.com/${ref.owner}/${ref.repo}/${type}/${ref.number}`;
  }
  parsed.hash = '';
  for (const name of [...parsed.searchParams.keys()]) {
    if (isTracking(name)) parsed.searchParams.delete(name);
  }
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
};
