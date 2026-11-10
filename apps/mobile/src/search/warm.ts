import type { TreeEntry } from './index.js';

/** Text a search can use; binaries and encrypted blobs only ever match by name. */
const TEXT_FILE = /\.(md|bookmarks\.json|txt)$/i;

/**
 * Files whose content is worth fetching so content search covers more than the files opened
 * so far. Capped, so a huge repo never turns opening search into a mass download.
 */
export function pickWarmPaths(
  tree: readonly TreeEntry[],
  isCached: (path: string) => boolean,
  limit: number,
): string[] {
  const picked: string[] = [];
  for (const { path, type } of tree) {
    if (picked.length >= limit) break;
    if (type === 'tree' || path.endsWith('.enc') || !TEXT_FILE.test(path) || isCached(path)) {
      continue;
    }
    picked.push(path);
  }
  return picked;
}
