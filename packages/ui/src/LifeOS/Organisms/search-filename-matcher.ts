import type { TreeItem } from '@kaihuman/core';

export interface FilenameMatch {
  name: string;
  path: string;
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * Match filenames locally against the already-loaded repo tree instead of
 * hitting GitHub's rate-limited `/search/code` endpoint. Prefix matches on the
 * basename rank above substring matches; ties keep tree order.
 */
export function matchFilenames(tree: TreeItem[], query: string, limit = 10): FilenameMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const prefix: FilenameMatch[] = [];
  const substring: FilenameMatch[] = [];

  for (const item of tree) {
    if (item.type !== 'blob') continue;
    const name = basename(item.path);
    const idx = name.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    (idx === 0 ? prefix : substring).push({ name, path: item.path });
  }

  return [...prefix, ...substring].slice(0, limit);
}
