import { githubFileStore } from '@kaihuman/core';
import { canServeFromCache } from './revalidate.js';
import { syncRevision } from './status.js';

interface Readable<T> {
  peek(): T;
}

/** The part of `githubFileStore` a cache-first read uses; injected so it is tested with fakes. */
export interface CacheReadStore {
  openFiles: Readable<Readonly<Record<string, { content: string; sha: string }>>>;
  tree: Readable<readonly { path: string; sha: string }[]>;
  dirtyFiles: Readable<ReadonlySet<string>>;
  openFile(path: string): Promise<void>;
  /** Loads the on-device copy into `openFiles` without the network; true when one is there. */
  restoreCached(path: string): Promise<boolean>;
}

export interface CacheFirstReader {
  /**
   * Stale-while-revalidate: any cached copy (memory, then disk) answers at once; when the tree
   * says it is out of date it is re-fetched behind the screen and `onRevalidated` fires if the
   * text changed. Only a file with no cached copy waits for the network. Null when the file
   * cannot be read (not in the tree with `requireInTree`, or the open failed quietly).
   */
  read(path: string, opts?: { requireInTree?: boolean }): Promise<string | null>;
}

export function createCacheFirstReader(
  store: CacheReadStore,
  onRevalidated: () => void,
): CacheFirstReader {
  const inFlight = new Set<string>();

  const revalidate = (path: string) => {
    if (inFlight.has(path)) return;
    inFlight.add(path);
    const before = store.openFiles.peek()[path]?.content;
    store
      .openFile(path)
      .then(() => {
        if (store.openFiles.peek()[path]?.content !== before) onRevalidated();
      })
      // Offline or a transient error: the cached copy stays on screen; the next sync retries.
      .catch(() => undefined)
      .finally(() => inFlight.delete(path));
  };

  const fresh = (path: string) =>
    canServeFromCache(
      store.openFiles.peek()[path],
      store.tree.peek().find((t) => t.path === path),
      store.dirtyFiles.peek().has(path),
    );

  return {
    async read(path, { requireInTree = false } = {}) {
      let open = store.openFiles.peek()[path];
      if (!open) {
        if (requireInTree && !store.tree.peek().some((t) => t.path === path)) return null;
        if (await store.restoreCached(path).catch(() => false)) open = store.openFiles.peek()[path];
      }
      if (open) {
        if (!fresh(path)) revalidate(path);
        return open.content;
      }
      await store.openFile(path);
      return store.openFiles.peek()[path]?.content ?? null;
    },
  };
}

/** The app's reader over `githubFileStore`; a revalidated file re-renders screens like a sync does. */
export const githubCacheReader: CacheFirstReader = createCacheFirstReader(githubFileStore, () => {
  syncRevision.value += 1;
});
