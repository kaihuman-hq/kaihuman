import { githubService, type TreeItem } from '@kaihuman/core';

// Contents by `repo:path`, valid while the tree still lists the same blob sha. Survives
// navigating away and back, so pages do not refetch unchanged files.
const contentCache = new Map<string, { sha: string; content: string }>();
const cacheKey = (repo: string, path: string) => `${repo}:${path}`;

/** Seeds the cache, e.g. after a write, so the page shows it until the tree has the new sha. */
export const rememberRepoFile = (repo: string, path: string, sha: string, content: string) => {
  contentCache.set(cacheKey(repo, path), { sha, content });
};

export interface LoadedFiles {
  contents: Record<string, string>;
  /** One `path: message` per file that could not be read. */
  errors: string[];
}

/** Reads the given files `concurrency` at a time, skipping those cached for the same sha. */
export async function loadRepoFiles(
  repoFullName: string,
  items: readonly TreeItem[],
  concurrency = 4,
): Promise<LoadedFiles> {
  const [owner = '', name = ''] = repoFullName.split('/');
  const contents: Record<string, string> = {};
  const errors: string[] = [];
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
        const { content } = await githubService.getFileContent(owner, name, item.path);
        contentCache.set(key, { sha: item.sha, content });
        contents[item.path] = content;
      } catch (err) {
        errors.push(`${item.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { contents, errors };
}
