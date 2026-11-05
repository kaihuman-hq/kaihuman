import { describe, expect, it } from 'vitest';
import { parseActionLog } from './action-log.js';
import { parseCommands } from './commands.js';
import {
  addActionLogEntry,
  addCommandEntry,
  addEventEntry,
  addPromptEntry,
  addReadLaterEntry,
  addTodoEntry,
  splitInlineTags,
} from './entries.js';
import { parseEvents } from './events.js';
import { parsePrompts } from './prompts.js';
import { parseTodos } from './todos.js';

const NOW = new Date(2026, 8, 24, 7, 5, 3);

describe('splitInlineTags', () => {
  it('takes #tags out of the text', () => {
    expect(splitInlineTags('Call #admin the  bank #urgent')).toEqual({
      text: 'Call the bank',
      tags: ['admin', 'urgent'],
    });
  });
});

describe('addTodoEntry', () => {
  it('adds a backlog todo, typed and given tags merged, as the widget writes it', () => {
    const next = addTodoEntry(
      '- [x] Done\n',
      { text: 'Call #admin the bank', tags: ['home'] },
      NOW,
    );
    expect(next).toBe(
      `- [x] Done\n- [ ] Call the bank #home #admin\n::updated:: ${NOW.getTime()} ::created:: ${NOW.toISOString()}\n`,
    );
    expect(parseTodos(next).items[1]).toMatchObject({
      text: 'Call the bank',
      status: 'backlog',
      tags: ['home', 'admin'],
    });
  });

  it('puts the todo first when position is top', () => {
    const next = addTodoEntry('- [x] Done\n', { text: 'New', position: 'top' }, NOW);
    expect(parseTodos(next).items.map((i) => i.text)).toEqual(['New', 'Done']);
  });

  it('keeps milestones and takes a milestone and a prompt', () => {
    const md = '---\nmilestones:\n  - id: v1\n    name: One\n---\n\n- [ ] Old\n';
    const next = addTodoEntry(
      md,
      { text: 'Ship', milestoneId: 'v1', prompt: { lines: [], refFile: 'a.md' } },
      NOW,
    );
    const data = parseTodos(next);
    expect(data.milestones).toEqual([{ id: 'v1', name: 'One' }]);
    expect(data.items[1]).toMatchObject({ milestoneId: 'v1', prompt: { refFile: 'a.md' } });
  });

  it('refuses a todo with no text', () => {
    expect(() => addTodoEntry('', { text: ' #only-a-tag ' })).toThrow('Nothing to add');
  });
});

describe('addActionLogEntry', () => {
  it('adds a timestamped entry in local time, keeping the text as typed', () => {
    const next = addActionLogEntry(
      '---\n---\n\n# Action Log\n\n- 2026-09-23 10:00:00 Old',
      { description: 'Shipped #work it', tags: ['release'] },
      NOW,
    );
    expect(next.split('\n').at(-1)).toBe('- 2026-09-24 07:05:03 Shipped #work it #release');
    expect(parseActionLog(next).entries).toHaveLength(2);
    expect(() => addActionLogEntry('', { description: ' ' })).toThrow('Nothing to add');
  });
});

describe('addEventEntry', () => {
  it('adds a row, with the header for a new file', () => {
    expect(addEventEntry('', { name: 'Trip', type: 'general', startDate: '2026-10-01' })).toBe(
      'name;type;start iso date;end iso date\nTrip;general;2026-10-01;2026-10-01\n',
    );
    const next = addEventEntry(
      'name;type;start iso date;end iso date\nA;general;2026-01-01;2026-01-02\n',
      {
        name: 'Anna',
        type: 'Birthday',
        startDate: '1990-05-04',
        endDate: '1990-06-01',
      },
    );
    expect(parseEvents(next).entries.at(-1)).toEqual({
      name: 'Anna',
      type: 'birthday',
      startDate: '1990-05-04',
      endDate: '1990-05-04',
    });
  });

  it('refuses what the file cannot hold', () => {
    const event = { name: 'A', type: 'general', startDate: '2026-10-01' };
    expect(() => addEventEntry('', { ...event, name: '' })).toThrow('needs a name');
    expect(() => addEventEntry('', { ...event, name: 'a;b' })).toThrow('“;”');
    expect(() => addEventEntry('', { ...event, startDate: '1.10.2026' })).toThrow('YYYY-MM-DD');
    expect(() => addEventEntry('', { ...event, endDate: '2026-09-30' })).toThrow('ends before');
    expect(() => addEventEntry('', { ...event, type: 'two words' })).toThrow('one word');
  });
});

describe('addPromptEntry', () => {
  it('adds a section the prompts parser reads back', () => {
    const next = addPromptEntry('# Prompts\n\n## Old #git\n\nOld body\n', {
      title: 'Review this #code',
      body: '## not a heading',
    });
    expect(next).toBe(
      '# Prompts\n\n## Old #git\n\nOld body\n\n## Review this #code\n\n\\## not a heading\n',
    );
    expect(parsePrompts(next).at(-1)).toEqual({
      title: 'Review this',
      tags: ['code'],
      body: '## not a heading',
    });
    expect(() => addPromptEntry('', { title: '#only', body: 'b' })).toThrow('needs a title');
    expect(() => addPromptEntry('', { title: 'T', body: ' ' })).toThrow('Nothing to add');
  });
});

describe('addCommandEntry', () => {
  it('puts the command in a sh block the commands parser reads back', () => {
    const next = addCommandEntry('', { title: 'Serve #dev', command: 'npx serve -p {{port}}' });
    expect(next).toBe('# Commands\n\n## Serve #dev\n\n```sh\nnpx serve -p {{port}}\n```\n');
    expect(parseCommands(next)).toEqual([
      { title: 'Serve', tags: ['dev'], command: 'npx serve -p {{port}}', note: '' },
    ]);
    expect(() => addCommandEntry('', { title: 'T', command: '' })).toThrow('Nothing to add');
  });
});

describe('addReadLaterEntry', () => {
  it('keeps summary, tags and readMinutes', () => {
    const json = addReadLaterEntry(
      '',
      { url: 'https://a.b', title: 'A', summary: 'Short.', tags: ['rust'], readMinutes: 4 },
      'id1',
      5,
    );
    expect(JSON.parse(json).items[0]).toEqual({
      id: 'id1',
      url: 'https://a.b',
      name: 'A',
      status: 'new',
      tags: ['rust'],
      summary: 'Short.',
      readMinutes: 4,
      createdAt: 5,
      updatedAt: 5,
    });
  });
});
