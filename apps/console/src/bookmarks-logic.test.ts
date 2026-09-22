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
} from '../../../packages/ui/src/LifeOS/Organisms/Widgets/BookmarksLogic';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (id: string, url: string, tags: string[] = [], title = id): Bookmark => ({
  id,
  title,
  url,
  tags,
  createdAt: NOW,
  updatedAt: NOW,
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
