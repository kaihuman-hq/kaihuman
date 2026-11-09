import { useEffect, useState } from 'react';
import type { FeedSnapshot } from '../components/widgets/more-tiles.js';
import { feedStore } from './feed-store.js';

/** Feed state lives outside the file; re-render whenever the store reports a change. */
export function useFeedSnapshot(): FeedSnapshot {
  const [snap, setSnap] = useState<FeedSnapshot>(() => feedStore.snapshot());
  useEffect(() => {
    setSnap(feedStore.snapshot());
    return feedStore.subscribe(() => setSnap(feedStore.snapshot()));
  }, []);
  return snap;
}

/** Fetches the given feeds (cached for 15 minutes by the store) whenever the set changes. */
export function useEnsureFeeds(urls: readonly string[]): void {
  const key = urls.join('\n');
  useEffect(() => {
    if (key) void feedStore.ensure(key.split('\n'));
  }, [key]);
}
