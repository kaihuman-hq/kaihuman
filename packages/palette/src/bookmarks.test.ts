import { describe, expect, it } from 'vitest';
import { type Bookmark, searchBookmarks } from './bookmarks.js';

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
