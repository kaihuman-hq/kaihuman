import { Logger } from '@lifosy/core';
import { signal } from '@preact/signals';
import { fetchFeedXml, parseFeedItems, type RssItem } from './RssLogic';

const logger = new Logger('RssService');

export interface FeedState {
  items: RssItem[];
  lastFetched: number;
  loading: boolean;
  error: string | null;
}

const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class RssService {
  // Map of URL -> FeedState
  feeds = signal<Record<string, FeedState>>({});

  // Helper to init state for a feed if missing
  private initFeed(url: string) {
    if (!this.feeds.value[url]) {
      this.feeds.value = {
        ...this.feeds.value,
        [url]: {
          items: [],
          lastFetched: 0,
          loading: false,
          error: null,
        },
      };
    }
  }

  async ensureFeed(url: string) {
    this.initFeed(url);
    const feed = this.feeds.value[url];
    const now = Date.now();

    // Cache valid?
    if (feed && feed.items.length > 0 && now - feed.lastFetched < CACHE_DURATION_MS) {
      logger.debug(`[Cache Hit] ${url}`);
      return;
    }

    // Already loading?
    if (feed?.loading) return;

    await this.fetchFeed(url);
  }

  async refreshFeed(url: string) {
    await this.fetchFeed(url);
  }

  private async fetchFeed(url: string) {
    logger.debug(`[Fetching] ${url}`);

    // Set Loading
    const current = this.feeds.value[url] || {
      items: [],
      lastFetched: 0,
      loading: false,
      error: null,
    };
    this.feeds.value = {
      ...this.feeds.value,
      [url]: { ...current, loading: true, error: null },
    };

    try {
      const xml = await fetchFeedXml(url);
      if (!xml) {
        throw new Error('Failed to fetch XML');
      }

      const items = parseFeedItems(xml);

      // Update Success
      this.feeds.value = {
        ...this.feeds.value,
        [url]: {
          items,
          lastFetched: Date.now(),
          loading: false,
          error: null,
        },
      };
    } catch (e: any) {
      logger.error(`Failed to fetch feed ${url}`, e);
      // Update Error
      const current = this.feeds.value[url] || { items: [], lastFetched: 0 };
      this.feeds.value = {
        ...this.feeds.value,
        [url]: {
          items: current.items || [], // Fallback to empty array if somehow undefined
          lastFetched: current.lastFetched || 0,
          loading: false,
          error: e.message || 'Unknown error',
        },
      };
    }
  }
  // Optimistic Read IDs (persists across component unmounts)
  optimisticReads = signal<Set<string>>(new Set());

  markOptimisticRead(id: string) {
    const current = this.optimisticReads.value;
    if (!current.has(id)) {
      const next = new Set(current);
      next.add(id);
      this.optimisticReads.value = next;
    }
  }

  isRead(id: string, configReadIds: Set<string>) {
    return configReadIds.has(id) || this.optimisticReads.value.has(id);
  }
}

export const rssService = new RssService();
