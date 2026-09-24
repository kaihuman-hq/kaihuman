import { describe, expect, it } from 'vitest';
import { parsePrompts } from './prompts.js';

describe('parsePrompts', () => {
  it('reads one prompt per H2, with tags split off the title and blank edges trimmed', () => {
    const file = [
      '# Prompts',
      'ignored preamble',
      '',
      '## Commit message #git #ai',
      '',
      'Write a conventional commit.',
      '  Keep it short.',
      '',
      '## Empty one',
    ].join('\r\n');
    expect(parsePrompts(file)).toEqual([
      {
        title: 'Commit message',
        tags: ['git', 'ai'],
        body: 'Write a conventional commit.\n  Keep it short.',
      },
      { title: 'Empty one', tags: [], body: '' },
    ]);
  });

  it('unescapes a body line that starts with an escaped heading', () => {
    const [prompt] = parsePrompts('## Outline\n\\## Section\n\\\\## Kept escaped once');
    expect(prompt?.body).toBe('## Section\n\\## Kept escaped once');
  });

  it('finds nothing in a file without H2s', () => {
    expect(parsePrompts('# Prompts\n\n### not a prompt')).toEqual([]);
  });
});
