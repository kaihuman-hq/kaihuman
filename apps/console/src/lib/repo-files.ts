import { githubService, type TreeItem } from '@kaihuman/core';

// Contents by `repo:path`, valid while the tree still lists the same blob sha. Survives
// navigating away and back, so pages do not refetch unchanged files.
const contentCache = new Map<string, { sha: string; content: string }>();
const cacheKey = (repo: string, path: string) => `${repo}:${path}`;

/** Seeds the cache, e.g. after a write, so the page shows it until the tree has the new sha. */
export const rememberRepoFile = (repo: string, path: string, sha: string, content: string) => {
  contentCache.set(cacheKey(repo, path), { sha, content });
};

/** Test-only: the cache is module state that outlives a test. */
export const __resetRepoFilesCacheForTests = () => contentCache.clear();

export interface LoadedFiles {
  contents: Record<string, string>;
  /** One `path: message` per file that could not be read. */
  errors: string[];
  /** Paths whose fetched blob differs from the listed sha (only checked with `opts.ref`). */
  mismatched: string[];
}

/** Reads the given files `concurrency` at a time, skipping those cached for the same sha. */
export async function loadRepoFiles(
  repoFullName: string,
  items: readonly TreeItem[],
  concurrency = 4,
  /** `ref`: read each file as of this commit and cache nothing that does not match the item. */
  opts: { ref?: string } = {},
): Promise<LoadedFiles> {
  const [owner = '', name = ''] = repoFullName.split('/');
  const contents: Record<string, string> = {};
  const errors: string[] = [];
  const mismatched: string[] = [];
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const key = cacheKey(repoFullName, item.path);
      const cached = contentCache.get(key);
      if (cached && cached.sha === item.sha) {
        contents[item.path] = cached.content;
        continue;
      }
      try {
        const { content, sha } = await githubService.getFileContent(
          owner,
          name,
          item.path,
          opts.ref ? { ref: opts.ref } : undefined,
        );
        if (opts.ref && sha !== item.sha) {
          mismatched.push(item.path);
          continue;
        }
        // By-path reads can be served from the browser HTTP cache, so `content` may be older than
        // the tree's blob. Cache only what GitHub says is the listed blob; a pinned write reads
        // this cache and must never get stale content from it.
        if (sha === item.sha) contentCache.set(key, { sha, content });
        contents[item.path] = content;
      } catch (err) {
        errors.push(`${item.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { contents, errors, mismatched };
}
