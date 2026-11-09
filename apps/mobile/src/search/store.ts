import { getCoreStorage, githubFileStore } from '@kaihuman/core';
import { signal } from '@preact/signals';
import { useEffect, useState } from 'react';
import { useSyncRevision } from '../sync/index.js';
import { useSignalValue } from '../views/use-signal.js';
import { SearchIndex } from './index.js';
import { parseRecentSearches, withRecentSearch } from './search.js';

const RECENTS_KEY = 'kh.mobile.recent-searches';

export const searchIndex = new SearchIndex();

/** Cached content only: search never waits on the network, so unopened files match by name. */
export const cachedRead = (path: string): string | null =>
  githubFileStore.openFiles.peek()[path]?.content ?? null;

export const refreshSearchIndex = () => searchIndex.update(githubFileStore.tree.peek(), cachedRead);

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
    return () => {
      live = false;
    };
  }, [rev, tree]);
  return version;
}
