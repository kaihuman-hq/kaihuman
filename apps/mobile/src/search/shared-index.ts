import { githubFileStore } from '@kaihuman/core';
import { SearchIndex } from './index.js';

// No React imports: bootstrap (Spotlight sync) shares this index with the search screen.
export const searchIndex = new SearchIndex();

/** Cached content only: search never waits on the network, so unopened files match by name. */
export const cachedRead = (path: string): string | null =>
  githubFileStore.openFiles.peek()[path]?.content ?? null;

export const refreshSearchIndex = () => searchIndex.update(githubFileStore.tree.peek(), cachedRead);
