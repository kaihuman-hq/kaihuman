import { publishSpotlight, type SpotlightNative, type SpotlightSourceDoc } from './spotlight.js';

export interface SpotlightSyncDeps {
  native: SpotlightNative;
  /** Brings the search index up to date and returns its docs (the plug for any search backend). */
  refresh: () => Promise<readonly SpotlightSourceDoc[]>;
  /** Calls the listener whenever repo content may have changed; returns an unsubscribe. */
  onChange: (listener: () => void) => () => void;
  delayMs?: number;
}

/**
 * Republishes Spotlight items after content settles. Debounced: a sync touches many files and
 * re-indexing Spotlight per file would be wasted work.
 */
export function startSpotlightSync({
  native,
  refresh,
  onChange,
  delayMs = 5000,
}: SpotlightSyncDeps): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: string | undefined;
  let stopped = false;
  const run = () => {
    timer = undefined;
    void refresh()
      .then((docs) => {
        if (!stopped) last = publishSpotlight(native, docs, last);
      })
      .catch(() => undefined); // Spotlight is a convenience; never break the app over it.
  };
  const off = onChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  });
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    off();
  };
}
