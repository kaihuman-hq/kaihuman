import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  type Bookmark,
  type BookmarksConfig,
  collectTags,
  deleteBookmark,
  filterBookmarks,
  isBookmarkUrl,
  normalizeBookmarkUrl,
  parseBookmarks,
  serializeBookmarks,
  setBookmarkPinned,
  sortBookmarks,
  updateBookmark,
} from '../../../packages/ui/src/LifeOS/Organisms/Widgets/BookmarksLogic';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (
  id: string,
  url: string,
  tags: string[] = [],
  title = id,
  useCount = 0,
): Bookmark => ({
  id,
  title,
  url,
  tags,
  createdAt: NOW,
  updatedAt: NOW,
  useCount,
  lastUsedAt: '',
  pinned: false,
});

const config = (...bookmarks: Bookmark[]): BookmarksConfig => ({ bookmarks, updatedAt: NOW });

describe('isBookmarkUrl', () => {
  it('accepts http and https', () => {
    expect(isBookmarkUrl('http://example.com')).toBe(true);
    expect(isBookmarkUrl('https://example.com/a')).toBe(true);
  });

  it('rejects other schemes and malformed urls', () => {
    expect(isBookmarkUrl('javascript:alert(1)')).toBe(false);
    expect(isBookmarkUrl('file:///etc/passwd')).toBe(false);
    expect(isBookmarkUrl('chrome://extensions')).toBe(false);
    expect(isBookmarkUrl('not a url')).toBe(false);
  });
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
      bookmarks: [bookmark('b1', 'https://example.com/', ['dev'], 'Example')],
      updatedAt: NOW,
    });
  });

  it('returns the empty config for blank, malformed or shapeless content', () => {
    expect(parseBookmarks('')).toEqual({ bookmarks: [], updatedAt: '' });
    expect(parseBookmarks('   ')).toEqual({ bookmarks: [], updatedAt: '' });
    expect(parseBookmarks('{ not json')).toEqual({ bookmarks: [], updatedAt: '' });
    expect(parseBookmarks('{"bookmarks":"nope"}')).toEqual({ bookmarks: [], updatedAt: '' });
  });

  it('drops entries whose url cannot be opened', () => {
    const parsed = parseBookmarks(
      JSON.stringify({
        bookmarks: [
          { id: 'ok', url: 'https://example.com/' },
          { id: 'evil', url: 'javascript:alert(1)' },
          { id: 'missing' },
        ],
      }),
    );
    expect(parsed.bookmarks.map((b) => b.id)).toEqual(['ok']);
  });

  it('falls back to the url as title and tolerates missing tags', () => {
    const parsed = parseBookmarks(
      JSON.stringify({ bookmarks: [{ id: 'b1', url: 'https://example.com/' }] }),
    );
    expect(parsed.bookmarks[0]).toMatchObject({
      title: 'https://example.com/',
      tags: [],
    });
  });

  it('round-trips through serializeBookmarks', () => {
    const original = config(bookmark('b1', 'https://example.com/', ['dev']));
    expect(parseBookmarks(serializeBookmarks(original))).toEqual(original);
  });
});

describe('normalizeBookmarkUrl', () => {
  it('canonicalises urls so the same page is recognised', () => {
    expect(normalizeBookmarkUrl('https://example.com')).toBe('https://example.com/');
  });

  it('trims input it cannot parse', () => {
    expect(normalizeBookmarkUrl('  nonsense  ')).toBe('nonsense');
  });
});

describe('addBookmark', () => {
  it('prepends the new bookmark and stamps both timestamps', () => {
    const next = addBookmark(
      config(bookmark('b1', 'https://old.example/')),
      { title: ' New ', url: 'https://new.example', tags: [' dev ', ''] },
      NOW,
    );
    expect(next.bookmarks).toHaveLength(2);
    expect(next.bookmarks[0]).toMatchObject({
      title: 'New',
      url: 'https://new.example/',
      tags: ['dev'],
      createdAt: NOW,
      updatedAt: NOW,
      useCount: 0,
      lastUsedAt: '',
    });
    expect(next.updatedAt).toBe(NOW);
  });

  it('uses the url as the title when none is given', () => {
    const next = addBookmark(config(), { title: '  ', url: 'https://example.com/', tags: [] }, NOW);
    expect(next.bookmarks[0]?.title).toBe('https://example.com/');
  });

  it('rejects urls that are not http(s)', () => {
    expect(() =>
      addBookmark(config(), { title: 'Bad', url: 'javascript:alert(1)', tags: [] }, NOW),
    ).toThrow('http(s)');
  });

  it('rejects a page that is already bookmarked, ignoring url canonicalisation', () => {
    expect(() =>
      addBookmark(
        config(bookmark('b1', 'https://example.com/')),
        { title: 'Dupe', url: 'https://example.com', tags: [] },
        NOW,
      ),
    ).toThrow('already bookmarked');
  });
});

describe('deleteBookmark', () => {
  it('removes the bookmark and stamps the file', () => {
    const next = deleteBookmark(
      config(bookmark('b1', 'https://a.example/'), bookmark('b2', 'https://b.example/')),
      'b1',
      NOW,
    );
    expect(next.bookmarks.map((b) => b.id)).toEqual(['b2']);
    expect(next.updatedAt).toBe(NOW);
  });

  it('leaves the list alone for an unknown id', () => {
    const next = deleteBookmark(config(bookmark('b1', 'https://a.example/')), 'nope', NOW);
    expect(next.bookmarks.map((b) => b.id)).toEqual(['b1']);
  });
});

describe('updateBookmark', () => {
  const later = '2026-09-23T10:00:00.000Z';
  const used = { ...bookmark('b1', 'https://a.example/', ['dev'], 'A', 3), pinned: true };

  it('renames and relinks in place, keeping usage, pin and tags', () => {
    const next = updateBookmark(
      config(used, bookmark('b2', 'https://b.example/')),
      'b1',
      { title: ' Renamed ', url: 'https://moved.example' },
      later,
    );
    expect(next.bookmarks.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(next.bookmarks[0]).toMatchObject({
      title: 'Renamed',
      url: 'https://moved.example/',
      tags: ['dev'],
      useCount: 3,
      pinned: true,
      createdAt: NOW,
      updatedAt: later,
    });
    expect(next.bookmarks[1]?.updatedAt).toBe(NOW);
    expect(next.updatedAt).toBe(later);
  });

  it('falls back to the url when the title is cleared', () => {
    const next = updateBookmark(config(used), 'b1', { title: ' ', url: 'https://a.example/' });
    expect(next.bookmarks[0]?.title).toBe('https://a.example/');
  });

  it('keeps its own url without calling it a duplicate', () => {
    const next = updateBookmark(config(used), 'b1', { title: 'B', url: 'https://a.example' });
    expect(next.bookmarks[0]?.title).toBe('B');
  });

  it('rejects urls that are not http(s)', () => {
    expect(() =>
      updateBookmark(config(used), 'b1', { title: 'A', url: 'javascript:alert(1)' }),
    ).toThrow('http(s)');
  });

  it('rejects a url another bookmark already has', () => {
    expect(() =>
      updateBookmark(config(used, bookmark('b2', 'https://b.example/')), 'b1', {
        title: 'A',
        url: 'https://b.example',
      }),
    ).toThrow('already bookmarked');
  });
});

describe('setBookmarkPinned', () => {
  const later = '2026-09-23T10:00:00.000Z';

  it('pins one bookmark in place and stamps it and the file', () => {
    const next = setBookmarkPinned(
      config(bookmark('b1', 'https://a.example/'), bookmark('b2', 'https://b.example/')),
      'b2',
      true,
      later,
    );
    expect(next.bookmarks.map((b) => [b.id, b.pinned])).toEqual([
      ['b1', false],
      ['b2', true],
    ]);
    expect(next.bookmarks[1]?.updatedAt).toBe(later);
    expect(next.bookmarks[0]?.updatedAt).toBe(NOW);
    expect(next.updatedAt).toBe(later);
  });

  it('unpins again', () => {
    const pinned = setBookmarkPinned(config(bookmark('b1', 'https://a.example/')), 'b1', true);
    expect(setBookmarkPinned(pinned, 'b1', false).bookmarks[0]?.pinned).toBe(false);
  });

  // The extension writes the same file; a console edit must not drop a pin it set, and vice versa.
  it('survives a parse and serialize round trip', () => {
    const pinned = setBookmarkPinned(config(bookmark('b1', 'https://a.example/')), 'b1', true);
    expect(parseBookmarks(serializeBookmarks(pinned)).bookmarks[0]?.pinned).toBe(true);
  });

  it('reads only a literal true as pinned', () => {
    const parsed = parseBookmarks(
      JSON.stringify({
        bookmarks: [
          { id: 'b1', url: 'https://a.example/' },
          { id: 'b2', url: 'https://b.example/', pinned: 'yes' },
          { id: 'b3', url: 'https://c.example/', pinned: true },
        ],
      }),
    );
    expect(parsed.bookmarks.map((b) => b.pinned)).toEqual([false, false, true]);
  });
});

describe('collectTags', () => {
  it('returns each tag once, sorted', () => {
    expect(
      collectTags([
        bookmark('b1', 'https://a.example/', ['work', 'dev']),
        bookmark('b2', 'https://b.example/', ['dev']),
      ]),
    ).toEqual(['dev', 'work']);
  });
});

describe('filterBookmarks', () => {
  const bookmarks = [
    bookmark('b1', 'https://vitest.dev/guide', ['testing'], 'Vitest Guide'),
    bookmark('b2', 'https://example.com/', ['work'], 'Example'),
  ];

  it('keeps everything for an empty query', () => {
    expect(filterBookmarks(bookmarks, '  ')).toEqual(bookmarks);
  });

  it('matches title, url and tag case-insensitively', () => {
    expect(filterBookmarks(bookmarks, 'VITEST').map((b) => b.id)).toEqual(['b1']);
    expect(filterBookmarks(bookmarks, 'example.com').map((b) => b.id)).toEqual(['b2']);
    expect(filterBookmarks(bookmarks, 'testing').map((b) => b.id)).toEqual(['b1']);
  });

  it('narrows to a tag, combined with the query', () => {
    expect(filterBookmarks(bookmarks, '', 'work').map((b) => b.id)).toEqual(['b2']);
    expect(filterBookmarks(bookmarks, 'vitest', 'work')).toEqual([]);
  });
});

describe('usage fields', () => {
  // The extension counts opens into the same file. Parsing rebuilds each entry, so a console
  // edit would wipe those counts if they were not carried across.
  it('keeps the counts a sync wrote when the console rewrites the file', () => {
    const content = JSON.stringify({
      bookmarks: [
        {
          id: 'b1',
          title: 'Example',
          url: 'https://example.com/',
          tags: [],
          createdAt: NOW,
          updatedAt: NOW,
          useCount: 7,
          lastUsedAt: NOW,
        },
      ],
      updatedAt: NOW,
    });

    const reparsed = parseBookmarks(serializeBookmarks(parseBookmarks(content)));

    expect(reparsed.bookmarks[0]).toMatchObject({ useCount: 7, lastUsedAt: NOW });
  });

  it('reads a file written before usage was tracked as never opened', () => {
    const parsed = parseBookmarks(
      JSON.stringify({ bookmarks: [{ id: 'b1', url: 'https://example.com/' }] }),
    );

    expect(parsed.bookmarks[0]).toMatchObject({ useCount: 0, lastUsedAt: '' });
  });

  it('ignores a count that is not a sensible number', () => {
    const parsed = parseBookmarks(
      JSON.stringify({
        bookmarks: [
          { id: 'b1', url: 'https://a.example/', useCount: -2 },
          { id: 'b2', url: 'https://b.example/', useCount: 'many' },
        ],
      }),
    );

    expect(parsed.bookmarks.map((b) => b.useCount)).toEqual([0, 0]);
  });
});

describe('sortBookmarks', () => {
  const bookmarks = [
    bookmark('b1', 'https://a.example/', [], 'A', 5),
    bookmark('b2', 'https://b.example/', [], 'B', 0),
    bookmark('b3', 'https://c.example/', [], 'C', 2),
  ];

  it('leaves the file order alone for NEWEST', () => {
    expect(sortBookmarks(bookmarks, 'NEWEST')).toBe(bookmarks);
  });

  it('puts the never-opened ones first for LEAST_USED', () => {
    expect(sortBookmarks(bookmarks, 'LEAST_USED').map((b) => b.id)).toEqual(['b2', 'b3', 'b1']);
  });

  it('puts the most-opened ones first for MOST_USED', () => {
    expect(sortBookmarks(bookmarks, 'MOST_USED').map((b) => b.id)).toEqual(['b1', 'b3', 'b2']);
  });

  it('keeps the file order for ties, so the list does not jump about', () => {
    const tied = [
      bookmark('b1', 'https://a.example/', [], 'A', 1),
      bookmark('b2', 'https://b.example/', [], 'B', 1),
    ];

    expect(sortBookmarks(tied, 'LEAST_USED').map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(sortBookmarks(tied, 'MOST_USED').map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('does not change the list it was given', () => {
    sortBookmarks(bookmarks, 'LEAST_USED');
    expect(bookmarks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });
});
