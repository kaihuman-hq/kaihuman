import { describe, expect, it } from 'vitest';
import { extractWikilinks, linkMatchesPage, slugify } from './wikilinks.js';

describe('extractWikilinks', () => {
  it('extracts unique targets, dropping aliases and headings', () => {
    expect(
      extractWikilinks(
        'See [[React Hooks]], [[react-context|Context]], [[Vite#Config]] and [[React Hooks]].',
      ),
    ).toEqual(['React Hooks', 'react-context', 'Vite']);
  });

  it('ignores empty or unterminated links', () => {
    expect(extractWikilinks('[[ ]] and [[open')).toEqual([]);
  });
});

describe('slugify', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('  React Hooks: A Guide! ')).toBe('react-hooks-a-guide');
  });
});

describe('linkMatchesPage', () => {
  const page = { file: 'react-hooks.md', title: 'React Hooks' };

  it('matches title, slug, filename and slugified title case-insensitively', () => {
    for (const target of ['react hooks', 'React-Hooks', 'react-hooks.md', 'REACT HOOKS']) {
      expect(linkMatchesPage(target, page)).toBe(true);
    }
    expect(linkMatchesPage('React', page)).toBe(false);
  });
});
