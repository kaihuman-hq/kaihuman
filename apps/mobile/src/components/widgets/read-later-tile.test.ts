import { describe, expect, it } from 'vitest';
import {
  ALREADY_SAVED,
  addReadLaterItem,
  deleteReadLaterItem,
  markReadLaterNew,
  readLaterView,
} from './tile-controllers.js';

const NOW = new Date(2026, 10, 9, 12);
const file = JSON.stringify({
  items: [
    {
      id: 'a',
      url: 'https://a.test/',
      name: 'A',
      status: 'read',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'b',
      url: 'https://b.test/',
      name: 'B',
      status: 'new',
      tags: ['x'],
      createdAt: 2,
      updatedAt: 2,
    },
  ],
});

describe('markReadLaterNew', () => {
  it('moves a read item back to unread and stamps updatedAt', () => {
    const r = markReadLaterNew(file, 'a', NOW);
    if (!r.ok) throw new Error(r.error);
    const view = readLaterView(r.content);
    expect(view.unread.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(view.unread.find((i) => i.id === 'a')?.updatedAt).toBe(NOW.getTime());
  });
  it('rejects unknown ids and invalid JSON', () => {
    expect(markReadLaterNew(file, 'zzz', NOW).ok).toBe(false);
    expect(markReadLaterNew('{nope', 'a', NOW).ok).toBe(false);
  });
});

describe('deleteReadLaterItem', () => {
  it('removes only that item', () => {
    const r = deleteReadLaterItem(file, 'b');
    if (!r.ok) throw new Error(r.error);
    expect(readLaterView(r.content)).toMatchObject({ unread: [], read: [{ id: 'a' }] });
  });
  it('rejects unknown ids', () => {
    expect(deleteReadLaterItem(file, 'zzz').ok).toBe(false);
  });
});

describe('addReadLaterItem', () => {
  const item = { title: 'Post', url: 'https://x.test/p', source: 'X Blog' };
  it('prepends a new item with title as name and source as tag', () => {
    const r = addReadLaterItem(file, item, NOW);
    if (!r.ok) throw new Error(r.error);
    const [first] = JSON.parse(r.content).items;
    expect(first).toMatchObject({
      url: 'https://x.test/p',
      name: 'Post',
      status: 'new',
      tags: ['X Blog'],
      createdAt: NOW.getTime(),
    });
    expect(JSON.parse(r.content).items).toHaveLength(3);
  });
  it('starts a missing file', () => {
    const r = addReadLaterItem('', item, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(JSON.parse(r.content).items).toHaveLength(1);
  });
  it('skips a url already on the list, and an empty source adds no tag', () => {
    expect(addReadLaterItem(file, { ...item, url: 'https://b.test/' }, NOW)).toEqual({
      ok: false,
      error: ALREADY_SAVED,
    });
    const r = addReadLaterItem('', { ...item, source: '' }, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(JSON.parse(r.content).items[0].tags).toEqual([]);
  });
  it('rejects a non-http link', () => {
    expect(addReadLaterItem('', { ...item, url: 'javascript:1' }, NOW).ok).toBe(false);
  });
});
