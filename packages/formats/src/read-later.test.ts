import { describe, expect, it } from 'vitest';
import { addReadLaterEntry } from './entries.js';
import { markReadItLaterRead, parseReadItLater } from './read-later.js';

const JSON_LIST = JSON.stringify({
  items: [
    { id: 'a', url: 'https://a.example', name: 'A', status: 'new', tags: [], createdAt: 1 },
    { id: 'b', url: 'https://b.example', name: 'B', status: 'read', tags: [], createdAt: 2 },
  ],
});

describe('read it later', () => {
  it('reads an empty file as an empty list', () => {
    expect(parseReadItLater('')).toEqual({ items: [] });
  });

  it('marks an item read, keeping the rest', () => {
    const next = JSON.parse(markReadItLaterRead(JSON_LIST, 'a', 99));
    expect(next.items[0]).toMatchObject({ id: 'a', status: 'read', updatedAt: 99 });
    expect(next.items).toHaveLength(2);
    expect(() => markReadItLaterRead(JSON_LIST, 'gone')).toThrow('no longer on the list');
  });

  it('adds a page once, to a new file too', () => {
    const added = JSON.parse(
      addReadLaterEntry('', { url: 'https://d.example', title: ' D ' }, 'd', 5),
    );
    expect(added.items).toEqual([
      {
        id: 'd',
        url: 'https://d.example',
        name: 'D',
        status: 'new',
        tags: [],
        createdAt: 5,
        updatedAt: 5,
      },
    ]);
    expect(() =>
      addReadLaterEntry(JSON_LIST, { url: 'https://a.example', title: 'A' }, 'x'),
    ).toThrow('Already on the read-later list');
  });

  it('never writes over a list it could not read', () => {
    expect(() =>
      addReadLaterEntry('{ broken', { url: 'https://d.example', title: '' }, 'd'),
    ).toThrow('not valid JSON');
    expect(() => markReadItLaterRead('{ broken', 'a')).toThrow('not valid JSON');
  });
});
