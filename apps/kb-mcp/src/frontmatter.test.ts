import { describe, expect, it } from 'vitest';
import { getString, getStringArray, parseFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses scalars, quoted strings, booleans and inline arrays', () => {
    const { data, body } = parseFrontmatter(
      [
        '---',
        'title: "Say \\"hi\\", world"',
        "url: 'https://example.com/it''s'",
        'date: 2026-04-20',
        'processed: false',
        'tags: [ai, "machine, learning", \'llm\']',
        'type: concept',
        '---',
        '',
        '# Body',
      ].join('\n'),
    );
    expect(data).toEqual({
      title: 'Say "hi", world',
      url: "https://example.com/it's",
      date: '2026-04-20',
      processed: false,
      tags: ['ai', 'machine, learning', 'llm'],
      type: 'concept',
    });
    expect(body).toBe('\n# Body');
  });

  it('parses block lists', () => {
    const { data } = parseFrontmatter('---\nsources:\n  - a.md\n  - "b.md"\ntitle: X\n---\n');
    expect(data).toEqual({ sources: ['a.md', 'b.md'], title: 'X' });
  });

  it('handles CRLF and empty arrays', () => {
    const { data, body } = parseFrontmatter('---\r\ntags: []\r\ntitle: T\r\n---\r\ntext');
    expect(data).toEqual({ tags: [], title: 'T' });
    expect(body).toBe('text');
  });

  it('returns the whole text as body without frontmatter', () => {
    expect(parseFrontmatter('# Just markdown')).toEqual({ data: {}, body: '# Just markdown' });
  });
});

describe('getters', () => {
  it('coerces values safely', () => {
    const data = { a: 'x', b: ['y'], c: true };
    expect(getString(data, 'a')).toBe('x');
    expect(getString(data, 'b')).toBeUndefined();
    expect(getStringArray(data, 'a')).toEqual(['x']);
    expect(getStringArray(data, 'b')).toEqual(['y']);
    expect(getStringArray(data, 'c')).toEqual([]);
  });
});
