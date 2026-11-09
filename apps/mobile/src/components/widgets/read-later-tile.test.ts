import { describe, expect, it } from 'vitest';
import { deleteReadLaterItem, markReadLaterNew, readLaterView } from './tile-controllers.js';

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
