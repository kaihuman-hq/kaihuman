import { describe, expect, it } from 'vitest';
import {
  sortTaskRows,
  type TaskList,
  type TaskRow,
  taskBoardCounts,
  taskDueLabel,
  taskListName,
  taskRows,
} from './task-board.js';
import type { TodoItem } from './todos.js';

// Thursday 2026-11-12, noon local.
const NOW = new Date('2026-11-12T12:00:00').getTime();
const INBOX = 'kh/inbox.todos.md';
const todo = (id: string, p: Partial<TodoItem> = {}): TodoItem =>
  ({ id, text: id, status: 'backlog', tags: [], ...p }) as TodoItem;

const inbox: TaskList = {
  path: INBOX,
  name: 'Inbox',
  items: [
    todo('old', { dueDate: '2026-11-01', tags: ['home'] }),
    todo('today-late', { dueDate: '2026-11-12', dueTime: '18:00' }),
    todo('undated', { tags: ['home', 'errand'] }),
  ],
};
const work: TaskList = {
  path: 'kh/work.todos.md',
  name: 'work',
  items: [
    todo('tomorrow', { dueDate: '2026-11-13' }),
    todo('day7', { dueDate: '2026-11-18', tags: ['home'] }),
    todo('day8', { dueDate: '2026-11-19' }),
    todo('passed', { dueDate: '2026-11-12', dueTime: '09:00' }),
    todo('done1', { status: 'done', updatedAt: 1, tags: ['home'] }),
    todo('done2', { status: 'done', updatedAt: 2 }),
    todo('nope', { status: 'rejected', dueDate: '2026-11-12' }),
  ],
};
const lists = [inbox, work];
const ids = (rows: TaskRow[]) => rows.map((r) => r.item.id);
const rows = (view: Parameters<typeof taskRows>[1]) => taskRows(lists, view, INBOX, NOW);

describe('taskRows', () => {
  it('Today holds overdue (earlier days and passed times) and due-today items', () => {
    expect(ids(rows({ kind: 'smart', id: 'today' })).sort()).toEqual(
      ['old', 'passed', 'today-late'].sort(),
    );
  });
  it('Next 7 Days runs from overdue through day 7, open items only', () => {
    expect(ids(rows({ kind: 'smart', id: 'week' })).sort()).toEqual(
      ['day7', 'old', 'passed', 'today-late', 'tomorrow'].sort(),
    );
  });
  it('Inbox, list and tag views show open items', () => {
    expect(ids(rows({ kind: 'smart', id: 'inbox' }))).toEqual(['old', 'today-late', 'undated']);
    expect(ids(rows({ kind: 'list', path: work.path }))).toEqual([
      'tomorrow',
      'day7',
      'day8',
      'passed',
    ]);
    expect(ids(rows({ kind: 'tag', tag: 'home' }))).toEqual(['old', 'undated', 'day7']);
  });
  it('Completed lists done items, most recent first', () => {
    expect(ids(rows({ kind: 'smart', id: 'completed' }))).toEqual(['done2', 'done1']);
  });
});

describe('sortTaskRows', () => {
  it('sorts by due with undated last, or by list then due', () => {
    const all = rows({ kind: 'tag', tag: 'home' });
    expect(ids(sortTaskRows(all, 'due'))).toEqual(['old', 'day7', 'undated']);
    expect(ids(sortTaskRows(all, 'list'))).toEqual(['old', 'undated', 'day7']);
  });
});

describe('taskBoardCounts', () => {
  it('counts smart lists, open items per list and tags', () => {
    expect(taskBoardCounts(lists, INBOX, NOW)).toEqual({
      smart: { today: 3, week: 5, inbox: 3 },
      lists: { [INBOX]: 3, [work.path]: 4 },
      tags: [
        ['errand', 1],
        ['home', 3],
      ],
    });
  });
});

describe('taskListName / taskDueLabel', () => {
  it('names lists by file, the inbox as Inbox', () => {
    expect(taskListName(INBOX, INBOX)).toBe('Inbox');
    expect(taskListName('kh/projects/site.todos.md', INBOX)).toBe('site');
  });
  it('labels due dates relative to today', () => {
    expect(taskDueLabel(todo('a', { dueDate: '2026-11-12', dueTime: '18:00' }), NOW)).toBe('18:00');
    expect(taskDueLabel(todo('a', { dueDate: '2026-11-12' }), NOW)).toBe('Today');
    expect(taskDueLabel(todo('a', { dueDate: '2026-11-13' }), NOW)).toBe('Tomorrow');
    expect(taskDueLabel(todo('a', { dueDate: '2026-11-20', dueTime: '09:30' }), NOW)).toBe(
      'Nov 20 09:30',
    );
    expect(taskDueLabel(todo('a'), NOW)).toBeUndefined();
  });
});
