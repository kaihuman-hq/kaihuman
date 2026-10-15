import type { Bookmark } from '@kaihuman/palette';
import { describe, expect, it } from 'vitest';
import { recentlyUsedBookmarks } from './bookmarks';
import { frecency } from './ranking';

const now = new Date('2026-10-15T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const bookmark = (id: string, useCount: number, lastUsedAt: string): Bookmark => ({
  id,
  title: id,
  url: `https://${id}.example`,
  tags: [],
  createdAt: '',
  updatedAt: '',
  useCount,
  lastUsedAt,
  pinned: false,
});

describe('frecency', () => {
  it('ranks 30 uses 10 days ago above 1 use today', () => {
    expect(frecency({ useCount: 30, lastUsedAt: daysAgo(10) }, now)).toBeGreaterThan(
      frecency({ useCount: 1, lastUsedAt: daysAgo(0) }, now),
    );
  });

  it('ranks 1 use today above 5 uses 60 days ago', () => {
    expect(frecency({ useCount: 1, lastUsedAt: daysAgo(0) }, now)).toBeGreaterThan(
      frecency({ useCount: 5, lastUsedAt: daysAgo(60) }, now),
    );
  });

  it('scores a never-used bookmark 0', () => {
    expect(frecency({ useCount: 0, lastUsedAt: '' }, now)).toBe(0);
    expect(frecency({ useCount: 7, lastUsedAt: '' }, now)).toBe(0);
  });
});

describe('recentlyUsedBookmarks by frecency', () => {
  it('sorts never-used bookmarks last', () => {
    const list = [bookmark('never', 0, ''), bookmark('used', 1, daysAgo(3))];
    expect(recentlyUsedBookmarks(list, 12, now).map((b) => b.id)).toEqual(['used', 'never']);
  });

  it('orders by frecency, ties by lastUsedAt then file order', () => {
    const list = [
      bookmark('rare', 1, daysAgo(1)),
      bookmark('often', 30, daysAgo(10)),
      // Never used: both score 0, so file order decides.
      bookmark('tieA', 0, ''),
      bookmark('tieB', 0, ''),
    ];
    expect(recentlyUsedBookmarks(list, 12, now).map((b) => b.id)).toEqual([
      'often',
      'rare',
      'tieA',
      'tieB',
    ]);
    const same = [bookmark('old', 2, daysAgo(2)), bookmark('new', 2, daysAgo(2))];
    expect(recentlyUsedBookmarks(same, 12, now).map((b) => b.id)).toEqual(['old', 'new']);
  });
});
