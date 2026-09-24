import { describe, expect, it } from 'vitest';
import { parseCommands } from './commands.js';
import {
  appendActionLog,
  appendCommand,
  appendEvent,
  appendPrompt,
  appendTodo,
  ENTRY_SUFFIXES,
  entryKindOf,
} from './entries.js';
import { parsePrompts } from './prompts.js';

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

describe('appendTodo', () => {
  it('appends a backlog todo with its tags moved to the end', () => {
    expect(appendTodo('- [x] Done\n', 'Call #admin the bank', 'T')).toBe(
      '- [x] Done\n- [ ] Call the bank #admin\n::created:: T\n',
    );
    expect(appendTodo('- [x] Done', 'Next', 'T')).toBe('- [x] Done\n- [ ] Next\n::created:: T\n');
    expect(() => appendTodo('', ' #tag ', 'T')).toThrow('Nothing to add');
  });
});

describe('appendActionLog', () => {
  it('adds a timestamped line at the bottom, below any frontmatter', () => {
    const now = new Date(2026, 8, 24, 7, 5, 3);
    expect(appendActionLog('---\n---\n- 2026-09-23 10:00:00 Old', 'Shipped it #work', now)).toBe(
      '---\n---\n- 2026-09-23 10:00:00 Old\n- 2026-09-24 07:05:03 Shipped it #work\n',
    );
    expect(() => appendActionLog('', '', now)).toThrow('Nothing to add');
  });
});

describe('appendEvent', () => {
  it('starts a new file with the header', () => {
    expect(appendEvent('', ['Trip', 'general', '2026-10-01', '2026-10-03'])).toBe(
      'name;type;start iso date;end iso date\nTrip;general;2026-10-01;2026-10-03\n',
    );
  });

  it('appends a row, one day when no end is given, and a birthday always one day', () => {
    const csv = 'name;type;start iso date;end iso date\nA;general;2026-01-01;2026-01-01';
    expect(appendEvent(csv, ['Dentist', '', '2026-10-01', ''])).toBe(
      `${csv}\nDentist;general;2026-10-01;2026-10-01\n`,
    );
    expect(appendEvent(csv, ['Anna', 'Birthday', '1990-05-04', '1990-06-01'])).toBe(
      `${csv}\nAnna;birthday;1990-05-04;1990-05-04\n`,
    );
  });

  it('refuses what the file cannot hold', () => {
    expect(() => appendEvent('', ['', 'general', '2026-10-01'])).toThrow('needs a name');
    expect(() => appendEvent('', ['a;b', 'general', '2026-10-01'])).toThrow('“;”');
    expect(() => appendEvent('', ['A', 'general', '1.10.2026'])).toThrow('YYYY-MM-DD');
    expect(() => appendEvent('', ['A', 'general', '2026-10-02', '2026-10-01'])).toThrow(
      'ends before',
    );
    expect(() => appendEvent('', ['A', 'two words', '2026-10-01'])).toThrow('one word');
  });
});

describe('appendPrompt', () => {
  it('adds a section the prompts parser reads back', () => {
    const content = '# Prompts\n\n## Old #git\n\nOld body\n';
    const next = appendPrompt(content, ['Review #code this', 'Review the diff']);
    expect(next).toBe(`${content}\n## Review this #code\n\nReview the diff\n`);
    expect(parsePrompts(next).at(-1)).toEqual({
      title: 'Review this',
      tags: ['code'],
      body: 'Review the diff',
    });
  });

  it('gives a new file its heading, and keeps a ## body from reading as a heading', () => {
    const next = appendPrompt('', ['T', '## not a heading']);
    expect(next).toBe('# Prompts\n\n## T\n\n\\## not a heading\n');
    expect(parsePrompts(next)).toHaveLength(1);
    expect(() => appendPrompt('', ['#only', 'body'])).toThrow('needs a title');
    expect(() => appendPrompt('', ['T', ' '])).toThrow('Nothing to add');
  });
});

describe('appendCommand', () => {
  it('puts the command in a sh block the commands parser reads back', () => {
    const next = appendCommand('', ['Serve #dev', 'npx serve -p {{port}}']);
    expect(next).toBe('# Commands\n\n## Serve #dev\n\n```sh\nnpx serve -p {{port}}\n```\n');
    expect(parseCommands(next)).toEqual([
      { title: 'Serve', tags: ['dev'], command: 'npx serve -p {{port}}', note: '' },
    ]);
    expect(() => appendCommand('', ['T', ''])).toThrow('Nothing to add');
  });
});
