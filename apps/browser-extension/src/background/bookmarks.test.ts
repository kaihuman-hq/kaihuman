import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  applyUsage,
  BOOKMARKS_PATH,
  type Bookmark,
  type BookmarksCache,
  type BookmarkUsage,
  CACHE_TTL_MS,
  countUse,
  hasUsageToPush,
  isCacheStale,
  isCacheUsable,
  parseBookmarks,
  recentlyUsedBookmarks,
  searchBookmarks,
  serializeBookmarks,
  setBookmarkPinned,
  settleUsage,
  startPageBookmarks,
} from './bookmarks';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (title: string, url: string, tags: string[] = []): Bookmark => ({
  id: title,
  title,
  url,
  tags,
  createdAt: NOW,
  updatedAt: NOW,
  useCount: 0,
  lastUsedAt: '',
  pinned: false,
});

const cache = (over: Partial<BookmarksCache> = {}): BookmarksCache => ({
  repo: 'o/r',
  bookmarks: [],
  sha: 'abc',
  fetchedAt: 1000,
  ...over,
});

describe('parseBookmarks', () => {
  it('reads bookmarks with their title, tags and timestamps', () => {
    const parsed = parseBookmarks(
      JSON.stringify({
        bookmarks: [
          {
            id: 'b1',
            title: 'Example',
            url: 'https://example.com/',
            tags: ['dev'],
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        updatedAt: NOW,
      }),
    );
    expect(parsed).toEqual({
      bookmarks: [
        {
          id: 'b1',
          title: 'Example',
          url: 'https://example.com/',
          tags: ['dev'],
          createdAt: NOW,
          updatedAt: NOW,
          // A file written before usage was tracked reads back as never opened.
          useCount: 0,
          lastUsedAt: '',
          pinned: false,
        },
      ],
      updatedAt: NOW,
    });
  });

  it('reads the usage a previous sync wrote, and ignores a nonsense count', () => {
    const parsed = parseBookmarks(
      JSON.stringify({
        bookmarks: [
          { id: 'b1', url: 'https://a.example/', useCount: 4, lastUsedAt: NOW },
          { id: 'b2', url: 'https://b.example/', useCount: -3 },
          { id: 'b3', url: 'https://c.example/', useCount: 2.7 },
          { id: 'b4', url: 'https://d.example/', useCount: 'lots' },
        ],
      }),
    );

    expect(parsed.bookmarks.map((b) => b.useCount)).toEqual([4, 0, 2, 0]);
    expect(parsed.bookmarks[0]?.lastUsedAt).toBe(NOW);
  });

  it('treats an empty file as an empty list', () => {
    expect(parseBookmarks('')).toEqual({ bookmarks: [], updatedAt: '' });
    expect(parseBookmarks('   ')).toEqual({ bookmarks: [], updatedAt: '' });
  });

  it('rejects malformed json and a missing bookmarks array', () => {
    expect(() => parseBookmarks('{ not json')).toThrow(`${BOOKMARKS_PATH} is not valid JSON`);
    expect(() => parseBookmarks('{"bookmarks":"nope"}')).toThrow('missing a "bookmarks" array');
  });

  it('drops entries the browser must not navigate to', () => {
    const parsed = parseBookmarks(
      JSON.stringify({
        bookmarks: [
          { id: 'ok', url: 'https://example.com/' },
          { id: 'script', url: 'javascript:alert(1)' },
          { id: 'local', url: 'file:///etc/passwd' },
          { id: 'none' },
        ],
      }),
    );
    expect(parsed.bookmarks.map((b) => b.id)).toEqual(['ok']);
  });

  it('falls back to the url as the title and to no tags', () => {
    const parsed = parseBookmarks(
      JSON.stringify({ bookmarks: [{ id: 'b1', url: 'https://example.com/' }] }),
    );
    expect(parsed.bookmarks[0]).toMatchObject({ title: 'https://example.com/', tags: [] });
  });
});

describe('addBookmark', () => {
  const config = (...bookmarks: Bookmark[]) => ({ bookmarks, updatedAt: NOW });

  it('prepends the page, canonicalises the url and stamps both timestamps', () => {
    const next = addBookmark(
      config(bookmark('Old', 'https://old.example/')),
      { title: '  Vitest  ', url: ' https://vitest.dev ', tags: [' #testing ', ''] },
      NOW,
    );

    expect(next.bookmarks[0]).toMatchObject({
      title: 'Vitest',
      url: 'https://vitest.dev/',
      tags: ['testing'],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(next.bookmarks).toHaveLength(2);
    expect(next.updatedAt).toBe(NOW);
  });

  it('uses the url as the title when the page has none', () => {
    const next = addBookmark(
      config(),
      { title: '   ', url: 'https://example.com/', tags: [] },
      NOW,
    );
    expect(next.bookmarks[0]?.title).toBe('https://example.com/');
  });

  it('refuses a page the browser must not navigate to', () => {
    expect(() =>
      addBookmark(config(), { title: 'Bad', url: 'javascript:alert(1)', tags: [] }, NOW),
    ).toThrow('http(s)');
  });

  it('refuses a page already bookmarked, ignoring url canonicalisation', () => {
    expect(() =>
      addBookmark(
        config(bookmark('Example', 'https://example.com/')),
        { title: 'Example', url: 'https://example.com', tags: [] },
        NOW,
      ),
    ).toThrow('already bookmarked');
  });

  it('round-trips through serialize and parse', () => {
    const next = addBookmark(
      config(),
      { title: 'Vitest', url: 'https://vitest.dev/', tags: [] },
      NOW,
    );
    expect(parseBookmarks(serializeBookmarks(next))).toEqual(next);
  });
});

describe('isCacheUsable', () => {
  it('accepts a cache taken from the same repo', () => {
    expect(isCacheUsable(cache(), 'o/r')).toBe(true);
  });

  it('rejects a missing cache or one from another repo', () => {
    expect(isCacheUsable(undefined, 'o/r')).toBe(false);
    expect(isCacheUsable(cache({ repo: 'other/repo' }), 'o/r')).toBe(false);
  });
});

describe('isCacheStale', () => {
  it('is fresh inside the ttl and stale past it', () => {
    expect(isCacheStale(cache({ fetchedAt: 1000 }), 1000 + CACHE_TTL_MS)).toBe(false);
    expect(isCacheStale(cache({ fetchedAt: 1000 }), 1000 + CACHE_TTL_MS + 1)).toBe(true);
  });
});

describe('recentlyUsedBookmarks', () => {
  const used = (title: string, lastUsedAt: string): Bookmark => ({
    ...bookmark(title, `https://${title}.example/`),
    lastUsedAt,
  });

  it('puts the most recently opened first', () => {
    const bookmarks = [
      used('a', '2026-09-01T10:00:00.000Z'),
      used('b', '2026-09-03T10:00:00.000Z'),
      used('c', '2026-09-02T10:00:00.000Z'),
    ];
    expect(recentlyUsedBookmarks(bookmarks).map((b) => b.title)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the file order for bookmarks that were never opened', () => {
    const bookmarks = [
      used('newest', ''),
      used('older', ''),
      used('opened', '2026-09-01T10:00:00.000Z'),
    ];
    expect(recentlyUsedBookmarks(bookmarks).map((b) => b.title)).toEqual([
      'opened',
      'newest',
      'older',
    ]);
  });

  it('caps the list', () => {
    const bookmarks = Array.from({ length: 20 }, (_, i) => used(`b${i}`, ''));
    expect(recentlyUsedBookmarks(bookmarks)).toHaveLength(12);
    expect(recentlyUsedBookmarks(bookmarks, 3)).toHaveLength(3);
  });

  it('leaves the input alone', () => {
    const bookmarks = [
      used('a', '2026-09-01T10:00:00.000Z'),
      used('b', '2026-09-03T10:00:00.000Z'),
    ];
    recentlyUsedBookmarks(bookmarks);
    expect(bookmarks.map((b) => b.title)).toEqual(['a', 'b']);
  });
});

describe('startPageBookmarks', () => {
  const entry = (title: string, lastUsedAt: string, pinned = false): Bookmark => ({
    ...bookmark(title, `https://${title}.example/`),
    lastUsedAt,
    pinned,
  });

  it('puts every pinned bookmark first, in file order, then the recently used rest', () => {
    const bookmarks = [
      entry('recent', '2026-09-03T10:00:00.000Z'),
      entry('pinned-a', '', true),
      entry('older', '2026-09-01T10:00:00.000Z'),
      entry('pinned-b', '2026-09-02T10:00:00.000Z', true),
    ];
    expect(startPageBookmarks(bookmarks).map((b) => b.title)).toEqual([
      'pinned-a',
      'pinned-b',
      'recent',
      'older',
    ]);
  });

  it('never cuts a pin to fit the limit, and lists each bookmark once', () => {
    const bookmarks = [
      ...Array.from({ length: 3 }, (_, i) => entry(`pin${i}`, '', true)),
      ...Array.from({ length: 5 }, (_, i) => entry(`b${i}`, '')),
    ];
    const grid = startPageBookmarks(bookmarks, 2);
    expect(grid.map((b) => b.title)).toEqual(['pin0', 'pin1', 'pin2', 'b0', 'b1']);
  });
});

describe('setBookmarkPinned', () => {
  const later = '2026-09-23T10:00:00.000Z';
  const config = (...bookmarks: Bookmark[]) => ({ bookmarks, updatedAt: NOW });

  it('pins in place and stamps the bookmark and the file', () => {
    const next = setBookmarkPinned(
      config(bookmark('a', 'https://a.example/'), bookmark('b', 'https://b.example/')),
      'b',
      true,
      later,
    );
    expect(next.bookmarks.map((b) => [b.id, b.pinned, b.updatedAt])).toEqual([
      ['a', false, NOW],
      ['b', true, later],
    ]);
    expect(next.updatedAt).toBe(later);
  });

  it('refuses an id the file no longer has', () => {
    expect(() =>
      setBookmarkPinned(config(bookmark('a', 'https://a.example/')), 'gone', true),
    ).toThrow(/no longer in the repo/);
  });

  // Every sync rewrites the file from a parse, so a pin the console set must survive it.
  it('survives a parse and serialize round trip, and reads only a literal true', () => {
    const pinned = setBookmarkPinned(config(bookmark('a', 'https://a.example/')), 'a', true);
    expect(parseBookmarks(serializeBookmarks(pinned)).bookmarks[0]?.pinned).toBe(true);
    const odd = parseBookmarks(
      JSON.stringify({ bookmarks: [{ id: 'x', url: 'https://x.example/', pinned: 'yes' }] }),
    );
    expect(odd.bookmarks[0]?.pinned).toBe(false);
  });
});

describe('searchBookmarks', () => {
  const bookmarks = [
    bookmark('Zulip', 'https://zulip.example/', ['chat']),
    bookmark('Vitest guide', 'https://vitest.dev/guide', ['testing']),
    bookmark('Guide to nothing', 'https://example.com/vitest-mention', []),
  ];

  it('keeps the file order for an empty query', () => {
    expect(searchBookmarks(bookmarks, '  ').map((b) => b.title)).toEqual([
      'Zulip',
      'Vitest guide',
      'Guide to nothing',
    ]);
  });

  it('ranks a title prefix above a title substring, tags and the url', () => {
    expect(searchBookmarks(bookmarks, 'vitest').map((b) => b.title)).toEqual([
      'Vitest guide',
      'Guide to nothing',
    ]);
    expect(searchBookmarks(bookmarks, 'guide').map((b) => b.title)).toEqual([
      'Guide to nothing',
      'Vitest guide',
    ]);
    expect(searchBookmarks(bookmarks, 'chat').map((b) => b.title)).toEqual(['Zulip']);
  });

  it('drops bookmarks that match nothing and honours the limit', () => {
    expect(searchBookmarks(bookmarks, 'nonexistent')).toEqual([]);
    expect(searchBookmarks(bookmarks, 'guide', 1).map((b) => b.title)).toEqual([
      'Guide to nothing',
    ]);
  });
});

const LATER = '2026-09-23T10:00:00.000Z';

const usage = (deltas: BookmarkUsage['deltas']): BookmarkUsage => ({ repo: 'o/r', deltas });

const used = (b: Bookmark, count: number, lastUsedAt = NOW): Bookmark => ({
  ...b,
  useCount: count,
  lastUsedAt,
});

describe('applyUsage', () => {
  it('adds the counted opens to what GitHub holds rather than replacing them', () => {
    const remote = [used(bookmark('A', 'https://a.example/'), 5, NOW)];

    const merged = applyUsage(remote, usage({ A: { count: 3, lastUsedAt: LATER } }));

    expect(merged[0]).toMatchObject({ useCount: 8, lastUsedAt: LATER });
  });

  it('keeps the later of the two last-used stamps', () => {
    const remote = [used(bookmark('A', 'https://a.example/'), 1, LATER)];

    const merged = applyUsage(remote, usage({ A: { count: 1, lastUsedAt: NOW } }));

    expect(merged[0]?.lastUsedAt).toBe(LATER);
  });

  it('leaves bookmarks with no delta untouched, and hands back the same list when there are none', () => {
    const remote = [used(bookmark('A', 'https://a.example/'), 2)];

    expect(applyUsage(remote, usage({ B: { count: 9, lastUsedAt: NOW } }))[0]?.useCount).toBe(2);
    expect(applyUsage(remote, usage({}))).toBe(remote);
    expect(applyUsage(remote, undefined)).toBe(remote);
  });

  // GitHub leads on which bookmarks exist: one deleted in the console stays deleted, and the
  // count that was waiting for it goes with it.
  it('drops a delta for a bookmark GitHub no longer has', () => {
    const merged = applyUsage(
      [bookmark('A', 'https://a.example/')],
      usage({ gone: { count: 4, lastUsedAt: NOW } }),
    );

    expect(merged.map((b) => b.id)).toEqual(['A']);
  });
});

describe('hasUsageToPush', () => {
  it('is true only when a delta belongs to a bookmark that still exists', () => {
    const remote = [bookmark('A', 'https://a.example/')];

    expect(hasUsageToPush(remote, usage({ A: { count: 1, lastUsedAt: NOW } }))).toBe(true);
    expect(hasUsageToPush(remote, usage({ gone: { count: 1, lastUsedAt: NOW } }))).toBe(false);
    expect(hasUsageToPush(remote, usage({}))).toBe(false);
    expect(hasUsageToPush(remote, undefined)).toBe(false);
  });
});

describe('countUse', () => {
  it('starts a delta and then adds to it', () => {
    const once = countUse(usage({}), 'A', NOW);
    expect(once.deltas.A).toEqual({ count: 1, lastUsedAt: NOW });

    const twice = countUse(once, 'A', LATER);
    expect(twice.deltas.A).toEqual({ count: 2, lastUsedAt: LATER });
  });

  it('keeps the other bookmarks\u2019 deltas', () => {
    const next = countUse(usage({ B: { count: 2, lastUsedAt: NOW } }), 'A', NOW);
    expect(next.deltas.B).toEqual({ count: 2, lastUsedAt: NOW });
  });
});

describe('settleUsage', () => {
  it('clears what was pushed', () => {
    const settled = settleUsage(
      usage({ A: { count: 2, lastUsedAt: NOW } }),
      usage({ A: { count: 2, lastUsedAt: NOW } }),
    );

    expect(settled.deltas).toEqual({});
  });

  // An open counted while the commit was in flight has to survive it, or it is lost silently.
  it('keeps what was counted after the push started', () => {
    const settled = settleUsage(
      usage({ A: { count: 3, lastUsedAt: LATER } }),
      usage({ A: { count: 2, lastUsedAt: NOW } }),
    );

    expect(settled.deltas.A).toEqual({ count: 1, lastUsedAt: LATER });
  });

  it('leaves a bookmark that was not part of the push alone', () => {
    const settled = settleUsage(
      usage({ A: { count: 1, lastUsedAt: NOW }, B: { count: 4, lastUsedAt: NOW } }),
      usage({ A: { count: 1, lastUsedAt: NOW } }),
    );

    expect(settled.deltas).toEqual({ B: { count: 4, lastUsedAt: NOW } });
  });
});
