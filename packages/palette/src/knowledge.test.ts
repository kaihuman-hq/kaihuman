import { describe, expect, it } from 'vitest';
import { isKnowledgePath, knowledgeNote } from './knowledge.js';

const NOW = new Date(Date.UTC(2026, 8, 24, 7, 5, 3));

describe('knowledgeNote', () => {
  it('names the file after the first line and keeps the whole text as the body', () => {
    expect(knowledgeNote('  Zig comptime is neat!\nIt runs at build time.  ', NOW)).toEqual({
      path: `.kh/raw/${NOW.getTime()}-zig-comptime-is-neat.md`,
      content:
        '---\ntitle: "Zig comptime is neat!"\nurl: \'\'\ndate: 2026-09-24\nprocessed: false\ntags: [general]\n---\n\nZig comptime is neat!\nIt runs at build time.\n',
    });
  });

  it('escapes quotes in the title and falls back to "note" for a slug with no letters', () => {
    const { path, content } = knowledgeNote('"🙂"', NOW);
    expect(path).toBe(`.kh/raw/${NOW.getTime()}-note.md`);
    expect(content).toContain('title: "\\"🙂\\""');
  });

  it('keeps the slug short without a trailing dash', () => {
    const { path } = knowledgeNote(`${'abc '.repeat(20)}`, NOW);
    expect(path).toBe(`.kh/raw/${NOW.getTime()}-abc-abc-abc-abc-abc-abc-abc-abc-abc-abc.md`);
    expect(isKnowledgePath(path)).toBe(true);
  });

  it('refuses blank text', () => {
    expect(() => knowledgeNote(' \n ', NOW)).toThrow('Nothing to capture');
  });
});

describe('isKnowledgePath', () => {
  it('allows only a file directly in the inbox', () => {
    expect(isKnowledgePath('.kh/raw/123-a-note.md')).toBe(true);
    for (const bad of [
      '.kh/raw/processed/1-a.md',
      '.kh/raw/../x.md',
      '.kh/wiki/1-a.md',
      '.kh/raw/1-a.txt',
      '/.kh/raw/1-a.md',
      '.kh/raw/.md',
      '.kh/raw/-a.md',
    ]) {
      expect(isKnowledgePath(bad), bad).toBe(false);
    }
  });
});
