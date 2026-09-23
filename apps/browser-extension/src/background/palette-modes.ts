/**
 * What the palette's prefix modes ask the service worker for: the repository's prompt files (`>p`),
 * DeepL translations (`>t`) and the user's GitHub repositories (`>r`).
 *
 * The desktop palette answers the same requests from Rust (apps/desktop-palette/src-tauri), so the
 * two stay in step: same files, same endpoints, same error messages.
 */
import type { Translation } from '@lifosy/palette';

export interface PromptFile {
  path: string;
  content: string;
}

/** The prompt files as last fetched, for one repository. */
export interface PromptsCache {
  repo: string;
  files: PromptFile[];
  fetchedAt: number;
}

/**
 * Prompts change far less often than they are searched, so a cache younger than this answers on
 * its own; an older one still answers at once and is refreshed behind it.
 */
export const PROMPTS_CACHE_TTL_MS = 5 * 60 * 1000;

export const isPromptsCacheStale = (cache: PromptsCache, now: number) =>
  now - cache.fetchedAt > PROMPTS_CACHE_TTL_MS;

const githubHeaders = (token: string, accept = 'application/vnd.github+json') => ({
  Authorization: `Bearer ${token}`,
  Accept: accept,
});

/** `a b/c#1.md` → `a%20b/c%231.md`: each segment encoded, the slashes kept. */
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Every `.prompts.md` in the repository's default branch, from one tree listing. */
export function promptFilePaths(tree: { path: string; type: string }[]): string[] {
  return tree
    .filter((entry) => entry.type === 'blob' && entry.path.toLowerCase().endsWith('.prompts.md'))
    .map((entry) => entry.path);
}

/** One recursive tree listing to find the files, then one raw read per file. */
export async function fetchPromptFiles(token: string, repo: string): Promise<PromptFile[]> {
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`,
    { headers: githubHeaders(token) },
  );
  // An empty repository has no HEAD to list.
  if (treeResponse.status === 404 || treeResponse.status === 409) return [];
  if (!treeResponse.ok) throw new Error(`Could not list ${repo}: ${treeResponse.status}`);
  const { tree = [] } = await treeResponse.json();

  return Promise.all(
    promptFilePaths(tree).map(async (path) => {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/contents/${encodePath(path)}`,
        { headers: githubHeaders(token, 'application/vnd.github.raw+json') },
      );
      if (!response.ok) throw new Error(`Could not read ${path}: ${response.status}`);
      return { path, content: await response.text() };
    }),
  );
}

/** DeepL's free keys end in `:fx` and only work against the free endpoint. */
export const deeplEndpoint = (key: string) =>
  key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

const deeplError = (status: number) => {
  if (status === 403)
    return 'DeepL rejected the API key — set it again with “Set the DeepL API key…”';
  if (status === 456) return 'The DeepL quota for this month is used up';
  if (status === 429) return 'DeepL is rate limiting — try again in a moment';
  return `DeepL answered ${status}`;
};

/** One request per target — DeepL takes a single target language per call. */
export async function translateWithDeepl(
  key: string,
  text: string,
  targets: string[],
): Promise<Translation[]> {
  return Promise.all(
    targets.map(async (target) => {
      const response = await fetch(deeplEndpoint(key), {
        method: 'POST',
        headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: [text], target_lang: target }),
      });
      if (!response.ok) throw new Error(deeplError(response.status));
      const { translations = [] } = await response.json();
      const [first] = translations;
      if (!first) throw new Error('DeepL sent no translation back');
      return { target, text: first.text, detectedSource: first.detected_source_language };
    }),
  );
}

/** The repositories the token can see, most recently pushed first — GitHub's own order. */
export async function listGithubRepos(
  token: string,
): Promise<{ fullName: string; description?: string }[]> {
  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=pushed', {
    headers: githubHeaders(token),
  });
  if (!response.ok) throw new Error(`Could not list your repositories: ${response.status}`);
  const repos: { full_name: string; description: string | null }[] = await response.json();
  return repos.map((repo) => ({
    fullName: repo.full_name,
    ...(repo.description ? { description: repo.description } : {}),
  }));
}
