import { describe, expect, it, vi } from 'vitest';
import { FeedStore } from './feed-store.js';

const XML =
  '<rss><channel><title>T</title><item><title>A</title><link>https://x.test/a</link></item></channel></rss>';
const URL_A = 'https://x.test/feed';

describe('FeedStore', () => {
  it('fetches, parses, notifies and caches for 15 minutes', async () => {
    let now = 1000;
    const fetcher = vi.fn(async () => XML);
    const store = new FeedStore(fetcher, () => now);
    const seen: boolean[] = [];
    store.subscribe(() => seen.push(store.snapshot()[URL_A]?.loading ?? false));
    await store.ensure([URL_A]);
    expect(seen).toEqual([true, false]);
    expect(store.snapshot()[URL_A]).toMatchObject({ title: 'T', loading: false, fetchedAt: 1000 });
    expect(store.snapshot()[URL_A]?.items[0]?.title).toBe('A');
    now += 14 * 60_000;
    await store.ensure([URL_A]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await store.ensure([URL_A], true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    now += 15 * 60_000;
    await store.ensure([URL_A]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('records errors, keeps old items and retries', async () => {
    let fail = false;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error('boom');
      return XML;
    });
    const store = new FeedStore(fetcher, () => 1);
    await store.ensure([URL_A]);
    fail = true;
    await store.ensure([URL_A], true);
    expect(store.snapshot()[URL_A]).toMatchObject({ error: 'boom', loading: false });
    expect(store.snapshot()[URL_A]?.items).toHaveLength(1);
    fail = false;
    await store.ensure([URL_A]);
    expect(store.snapshot()[URL_A]?.error).toBeUndefined();
  });
  it('does not fetch a feed that is already loading and supports unsubscribe', async () => {
    let release: (s: string) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<string>((r) => {
          release = r;
        }),
    );
    const store = new FeedStore(fetcher, () => 1);
    const fn = vi.fn();
    store.subscribe(fn)();
    const first = store.ensure([URL_A]);
    await store.ensure([URL_A]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(XML);
    await first;
    expect(fn).not.toHaveBeenCalled();
  });
  it('changes the snapshot identity on every update', async () => {
    const store = new FeedStore(
      async () => XML,
      () => 1,
    );
    const before = store.snapshot();
    await store.ensure([URL_A]);
    expect(store.snapshot()).not.toBe(before);
  });
});
