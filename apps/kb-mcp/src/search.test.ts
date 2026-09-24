import { describe, expect, it } from 'vitest';
import { makeSnippet, type SearchablePage, searchPages, tokenize } from './search.js';

const pages: SearchablePage[] = [
  {
    file: 'react-hooks.md',
    title: 'React Hooks',
    type: 'concept',
    tags: ['react', 'frontend'],
    body: 'Hooks let components use state. useState and useEffect are common.',
  },
  {
    file: 'vite.md',
    title: 'Vite',
    type: 'entity',
    tags: ['build'],
    body: 'Vite is a build tool often used with React.',
  },
  { file: 'cooking.md', title: 'Cooking', tags: [], body: 'Nothing relevant here.' },
];

describe('tokenize', () => {
  it('lowercases, splits on non-alphanumerics and dedupes', () => {
    expect(tokenize('React, react HOOKS! über')).toEqual(['react', 'hooks', 'über']);
  });
});

describe('searchPages', () => {
  it('weights title and tag hits above body hits', () => {
    const results = searchPages(pages, 'react', 5);
    expect(results.map((r) => r.file)).toEqual(['react-hooks.md', 'vite.md']);
    // title 5 + tag 4 + no body hit vs a single body hit
    expect(results[0]?.score).toBe(9);
    expect(results[1]?.score).toBe(1);
    expect(results[0]).toMatchObject({ title: 'React Hooks', type: 'concept' });
  });

  it('boosts pages from the prebuilt inverted index and keywords', () => {
    const results = searchPages(pages, 'usestate', 5, {
      pages: { 'wiki/vite.md': { keywords: ['usestate'] } },
      index: { usestate: ['vite.md'] },
    });
    expect(results.map((r) => [r.file, r.score])).toEqual([
      ['vite.md', 5],
      ['react-hooks.md', 1],
    ]);
  });

  it('applies the limit and returns nothing for empty queries', () => {
    expect(searchPages(pages, 'react', 1)).toHaveLength(1);
    expect(searchPages(pages, '  !! ', 5)).toEqual([]);
  });
});

describe('makeSnippet', () => {
  it('centres on the first term hit and marks truncation', () => {
    const body = `${'x '.repeat(100)}needle ${'y '.repeat(100)}`;
    const snippet = makeSnippet(body, ['needle']);
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });
});
