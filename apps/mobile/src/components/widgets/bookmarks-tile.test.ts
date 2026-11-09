import { describe, expect, it } from 'vitest';
import {
  addBookmarkEntry,
  bookmarksView,
  editBookmarkEntry,
  parseBookmarksFile,
  parseTagInput,
  recordBookmarkUse,
  setBookmarkPinned,
} from './tile-controllers.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const LATER = new Date('2026-11-10T12:00:00.000Z');

const seeded = (() => {
  let content = '';
  for (const [i, url] of ['https://a.test/', 'https://b.test/'].entries()) {
    const r = addBookmarkEntry(
      content,
      { url, title: i ? '' : 'Alpha', tags: i ? ['x'] : ['x', 'y'] },
      new Date(NOW.getTime() + i),
    );
    if (!r.ok) throw new Error(r.error);
    content = r.content;
  }
  return content;
})();
const ids = parseBookmarksFile(seeded).bookmarks.map((b) => b.id);
const [idB, idA] = ids as [string, string];

const ok = (r: { ok: boolean; content?: string; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.content as string;
};

describe('add with optional title and tags', () => {
  it('keeps tags and falls back to the address for a blank title', () => {
    const [b, a] = parseBookmarksFile(seeded).bookmarks;
    expect(a).toMatchObject({ title: 'Alpha', tags: ['x', 'y'] });
    expect(b).toMatchObject({ title: 'https://b.test/', tags: ['x'] });
  });
});

describe('setBookmarkPinned', () => {
  it('pins and unpins, stamping updatedAt', () => {
    const pinned = ok(setBookmarkPinned(seeded, idA, true, LATER));
    const b = parseBookmarksFile(pinned).bookmarks.find((x) => x.id === idA);
    expect(b).toMatchObject({ pinned: true, updatedAt: LATER.toISOString() });
    const back = ok(setBookmarkPinned(pinned, idA, false, LATER));
    expect(parseBookmarksFile(back).bookmarks.find((x) => x.id === idA)?.pinned).toBe(false);
  });
  it('rejects unknown ids', () => {
    expect(setBookmarkPinned(seeded, 'nope', true, NOW).ok).toBe(false);
  });
});

describe('editBookmarkEntry', () => {
  it('changes title, url and tags', () => {
    const next = ok(
      editBookmarkEntry(seeded, idA, { title: 'New', url: 'https://c.test/p', tags: ['z'] }, LATER),
    );
    expect(parseBookmarksFile(next).bookmarks.find((x) => x.id === idA)).toMatchObject({
      title: 'New',
      url: 'https://c.test/p',
      tags: ['z'],
    });
  });
  it('blank title falls back to the url', () => {
    const next = ok(editBookmarkEntry(seeded, idA, { title: ' ', url: 'https://c.test/' }, LATER));
    expect(parseBookmarksFile(next).bookmarks.find((x) => x.id === idA)?.title).toBe(
      'https://c.test/',
    );
  });
  it('rejects bad urls, duplicates of another bookmark, and unknown ids', () => {
    expect(editBookmarkEntry(seeded, idA, { title: '', url: 'nope' }, NOW).ok).toBe(false);
    expect(editBookmarkEntry(seeded, idA, { title: '', url: 'https://b.test/' }, NOW).ok).toBe(
      false,
    );
    expect(editBookmarkEntry(seeded, 'nope', { title: '', url: 'https://c.test/' }, NOW).ok).toBe(
      false,
    );
    // Saving a bookmark with its own url is not a duplicate.
    expect(editBookmarkEntry(seeded, idA, { title: 'Same', url: 'https://a.test/' }, NOW).ok).toBe(
      true,
    );
  });
});

describe('recordBookmarkUse', () => {
  it('counts opens so usage sorts work', () => {
    let content = seeded;
    content = ok(recordBookmarkUse(content, idA, NOW));
    content = ok(recordBookmarkUse(content, idA, LATER));
    const a = parseBookmarksFile(content).bookmarks.find((x) => x.id === idA);
    expect(a).toMatchObject({ useCount: 2, lastUsedAt: LATER.toISOString() });
    const most = bookmarksView(content, { sort: 'MOST_USED' }, LATER).bookmarks.map((b) => b.id);
    expect(most[0]).toBe(idA);
    const frecent = bookmarksView(content, { sort: 'FRECENCY' }, LATER).bookmarks.map((b) => b.id);
    expect(frecent[0]).toBe(idA);
    expect(idB).not.toBe(idA);
  });
});

describe('parseTagInput', () => {
  it('splits on commas and spaces, strips #, de-duplicates', () => {
    expect(parseTagInput('work, #reading  work,')).toEqual(['work', 'reading']);
    expect(parseTagInput('')).toEqual([]);
  });
});
