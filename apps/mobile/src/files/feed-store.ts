import { parseFeedXml } from '@kaihuman/formats';
import type { FeedSnapshot, FeedState } from '../components/widgets/more-tiles.js';

export type FeedFetcher = (url: string) => Promise<string>;

const CACHE_MS = 15 * 60_000;
// Same CORS-free proxy the console uses.
const PROXY = 'https://fly.urbanisierung.dev/proxy/domain?feed=';

const getText = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/** Direct fetch first; the proxy when that fails, and on web where CORS blocks it. */
export const defaultFeedFetcher: FeedFetcher = async (url) => {
  const proxied = () => getText(`${PROXY}${encodeURIComponent(url)}`);
  // Lazy so node tests never load react-native.
  const { Platform } = await import('react-native');
  if (Platform.OS === 'web') return proxied();
  try {
    return await getText(url);
  } catch {
    return proxied();
  }
};

export class FeedStore {
  private state: Record<string, FeedState> = {};
  private snap: FeedSnapshot = this.state;
  private listeners = new Set<() => void>();

  constructor(
    private readonly fetcher: FeedFetcher = defaultFeedFetcher,
    private readonly clock: () => number = Date.now,
  ) {}

  /** A new object after every change, so it works as a store snapshot. */
  snapshot(): FeedSnapshot {
    return this.snap;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(url: string, next: FeedState): void {
    this.state = { ...this.state, [url]: next };
    this.snap = this.state;
    for (const fn of [...this.listeners]) fn();
  }

  /** Fetches feeds that are missing, stale (15 min) or being forced; never twice at once. */
  async ensure(urls: readonly string[], force = false): Promise<void> {
    const due = urls.filter((url) => {
      const cur = this.state[url];
      if (cur?.loading) return false;
      return force || !cur || this.clock() - cur.fetchedAt >= CACHE_MS || cur.error !== undefined;
    });
    await Promise.all(due.map((url) => this.load(url)));
  }

  private async load(url: string): Promise<void> {
    const prev = this.state[url];
    this.set(url, {
      items: prev?.items ?? [],
      fetchedAt: prev?.fetchedAt ?? 0,
      loading: true,
      ...(prev?.title ? { title: prev.title } : {}),
    });
    try {
      const { title, items } = parseFeedXml(await this.fetcher(url));
      this.set(url, {
        ...(title ? { title } : {}),
        items,
        fetchedAt: this.clock(),
        loading: false,
      });
    } catch (e) {
      this.set(url, {
        items: prev?.items ?? [],
        fetchedAt: this.clock(),
        loading: false,
        error: e instanceof Error ? e.message : String(e),
        ...(prev?.title ? { title: prev.title } : {}),
      });
    }
  }
}

export const feedStore = new FeedStore();
