import { describe, expect, it } from 'vitest';
import {
  BOOKMARKS_PATH,
  type Bookmark,
  type BookmarksCache,
  CACHE_TTL_MS,
  isCacheStale,
  isCacheUsable,
  parseBookmarks,
  searchBookmarks,
} from './bookmarks';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (title: string, url: string, tags: string[] = []): Bookmark => ({
  id: title,
  title,
  url,
  tags,
  createdAt: NOW,
  updatedAt: NOW,
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
        },
      ],
      updatedAt: NOW,
    });
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
