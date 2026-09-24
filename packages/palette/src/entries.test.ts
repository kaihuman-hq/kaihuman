import { describe, expect, it } from 'vitest';
import { ENTRY_SUFFIXES, entryKindOf } from './entries.js';

const NOW = new Date(2026, 8, 24, 7, 5, 3);

const add = (path: string, content: string, answers: string[]) => {
  const kind = entryKindOf(path);
  if (!kind) throw new Error(`no kind for ${path}`);
  return kind.add(content, answers, NOW);
};

describe('entryKindOf', () => {
  it('knows a file by its suffix, whatever the case', () => {
    expect(entryKindOf('work/Inbox.TODOS.md')?.entry).toBe('a todo');
    expect(entryKindOf('a.actionlog.md')?.entry).toBe('an action');
    expect(entryKindOf('family.events.csv')?.entry).toBe('an event');
    expect(entryKindOf('x.prompts.md')?.entry).toBe('a prompt');
    expect(entryKindOf('x.commands.md')?.entry).toBe('a command');
    expect(entryKindOf('notes.md')).toBeUndefined();
    expect(ENTRY_SUFFIXES).toContain('.todos.md');
  });
});

// The formats themselves are tested in @lifosy/formats; these check the answers reach them.
describe('each kind hands its answers to the shared add', () => {
  it('a todo, its #tags taken from the text', () => {
    expect(add('a.todos.md', '', ['Call #admin the bank'])).toBe(
      `- [ ] Call the bank #admin\n::updated:: ${NOW.getTime()} ::created:: ${NOW.toISOString()}\n`,
    );
  });

  it('an action, stamped with the time given', () => {
    expect(add('a.actionlog.md', '', ['Shipped it #work']).split('\n').at(-1)).toBe(
      '- 2026-09-24 07:05:03 Shipped it #work',
    );
  });

  it('an event, one day when no end date is given', () => {
    expect(add('a.events.csv', '', ['Trip', 'general', '2026-10-01', ''])).toBe(
      'name;type;start iso date;end iso date\nTrip;general;2026-10-01;2026-10-01\n',
    );
    expect(() => add('a.events.csv', '', ['a;b', 'general', '2026-10-01', ''])).toThrow('“;”');
  });

  it('a prompt and a command', () => {
    expect(add('a.prompts.md', '', ['Review #code', 'Look at the diff'])).toBe(
      '# Prompts\n\n## Review #code\n\nLook at the diff\n',
    );
    expect(add('a.commands.md', '', ['Serve', 'npx serve'])).toBe(
      '# Commands\n\n## Serve\n\n```sh\nnpx serve\n```\n',
    );
  });
});
