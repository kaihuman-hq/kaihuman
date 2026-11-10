import { getCoreStorage, githubFileStore } from '@kaihuman/core';
import { signal } from '@preact/signals';
import { useEffect, useState } from 'react';
import { useSyncRevision } from '../sync/index.js';
import { useSignalValue } from '../views/use-signal.js';
import { parseRecentSearches, withRecentSearch } from './search.js';
import { pickWarmPaths } from './warm.js';
import { refreshSearchIndex, searchIndex } from './shared-index.js';

export { cachedRead, refreshSearchIndex, searchIndex } from './shared-index.js';

const RECENTS_KEY = 'kh.mobile.recent-searches';

const loadRecents = (): string[] => {
  try {
    return parseRecentSearches(getCoreStorage().getItem(RECENTS_KEY));
  } catch {
    return [];
  }
};

const saveRecents = (list: string[]) => {
  try {
    getCoreStorage().setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // History is a convenience; a failed write must not break opening a result.
  }
};

export const recentSearches = signal<string[]>(loadRecents());

export function rememberSearch(query: string): void {
  recentSearches.value = withRecentSearch(recentSearches.value, query);
  saveRecents(recentSearches.value);
}

export function clearRecentSearches(): void {
  recentSearches.value = [];
  saveRecents([]);
}

const WARM_LIMIT = 300;
const WARM_BATCH = 4;

/**
 * Fetches content of files not opened yet, a few at a time, so content search covers the repo.
 * Stops at the first failure (offline) or when `isLive` turns false; the cache serves it later.
 */
export async function warmSearchContent(isLive: () => boolean, onBatch: () => void): Promise<void> {
  const paths = pickWarmPaths(
    githubFileStore.tree.peek(),
    (p) => cachedRead(p) !== null,
    WARM_LIMIT,
  );
  for (let i = 0; i < paths.length && isLive(); i += WARM_BATCH) {
    try {
      await Promise.all(paths.slice(i, i + WARM_BATCH).map((p) => githubFileStore.openFile(p)));
    } catch {
      return;
    }
    if (isLive()) onBatch();
  }
}

/**
 * Keeps the index current while a screen is mounted and returns a number that changes when it
 * does, so the screen queries again.
 */
export function useSearchIndex(): number {
  const rev = useSyncRevision();
  const tree = useSignalValue(githubFileStore.tree);
  const [version, setVersion] = useState(searchIndex.version);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` and `tree` are the triggers
  useEffect(() => {
    let live = true;
    void refreshSearchIndex().then(() => {
      if (live) setVersion(searchIndex.version);
    });
    void warmSearchContent(
      () => live,
      () =>
        void refreshSearchIndex().then(() => {
          if (live) setVersion(searchIndex.version);
        }),
    );
    return () => {
      live = false;
    };
  }, [rev, tree]);
  return version;
}
