import { describe, expect, it } from 'vitest';
import {
  findBacklinks,
  linkifyWikilinks,
  parseFrontmatter,
  resolveWikilink,
  wikilinkTargets,
} from '../../../packages/ui/src/LifeOS/Organisms/wiki-links';

const paths = [
  '.kh/wiki/spaced-repetition.md',
  '.kh/wiki/memory.md',
  '.kh/wiki/anki.md',
  'notes/memory.md',
  'README.md',
];

describe('parseFrontmatter', () => {
  it('reads title, type and inline tags', () => {
    const meta = parseFrontmatter(
      '---\ntitle: "Spaced Repetition"\ntype: concept\ntags: [learning, "memory"]\n---\nbody',
    );
    expect(meta).toEqual({
      title: 'Spaced Repetition',
      type: 'concept',
      tags: ['learning', 'memory'],
    });
  });

  it('returns no tags without frontmatter', () => {
    expect(parseFrontmatter('# Just a page')).toEqual({ tags: [] });
  });
});

describe('wikilinkTargets', () => {
  it('drops labels and headings, and ignores code', () => {
    const md =
      'See [[Memory|how memory works]] and [[Anki#Setup]].\n`[[Not A Link]]`\n```\n[[Nope]]\n```';
    expect(wikilinkTargets(md)).toEqual(['Memory', 'Anki']);
  });
});

describe('linkifyWikilinks', () => {
  it('turns wikilinks into wiki: links and leaves code untouched', () => {
    expect(linkifyWikilinks('[[Spaced Repetition|SRS]] `[[x]]`')).toBe(
      '[SRS](wiki:Spaced%20Repetition) `[[x]]`',
    );
  });
});

describe('resolveWikilink', () => {
  it('matches titles in any case through their slug', () => {
    expect(resolveWikilink('Spaced Repetition', paths)).toBe('.kh/wiki/spaced-repetition.md');
    expect(resolveWikilink('anki', paths)).toBe('.kh/wiki/anki.md');
  });

  it('matches exact paths, with or without the extension', () => {
    expect(resolveWikilink('README', paths)).toBe('README.md');
    expect(resolveWikilink('notes/memory.md', paths)).toBe('notes/memory.md');
  });

  it('prefers the page next to the linking page', () => {
    expect(resolveWikilink('Memory', paths, {}, 'notes/today.md')).toBe('notes/memory.md');
    expect(resolveWikilink('Memory', paths, {}, '.kh/wiki/anki.md')).toBe('.kh/wiki/memory.md');
  });

  it('falls back to frontmatter titles', () => {
    const titles = { '.kh/wiki/anki.md': 'Anki Flashcards' };
    expect(resolveWikilink('Anki Flashcards', paths, titles)).toBe('.kh/wiki/anki.md');
  });

  it('returns null for missing pages', () => {
    expect(resolveWikilink('Nowhere', paths)).toBeNull();
  });
});

describe('findBacklinks', () => {
  it('lists the pages linking to a page', () => {
    const contents = {
      '.kh/wiki/anki.md': 'Uses [[Spaced Repetition]].',
      '.kh/wiki/memory.md': 'Related: [[spaced-repetition|SRS]]',
      '.kh/wiki/spaced-repetition.md': 'Self link [[Spaced Repetition]]',
    };
    expect(findBacklinks('.kh/wiki/spaced-repetition.md', contents, paths, {})).toEqual([
      '.kh/wiki/anki.md',
      '.kh/wiki/memory.md',
    ]);
  });
});
