import { describe, expect, it } from 'vitest';
import { addTodoEntry } from './entries.js';
import {
  addDays,
  dueQuickPick,
  isTodoView,
  todoViewCounts,
  todoViewSections,
} from './todo-views.js';
import { parseTodos, type TodoItem } from './todos.js';

// Thursday 2026-11-12, noon local.
const NOW = new Date('2026-11-12T12:00:00').getTime();
const todo = (id: string, p: Partial<TodoItem> = {}): TodoItem =>
  ({ id, text: id, status: 'backlog', tags: [], ...p }) as TodoItem;

const items = [
  todo('old', { dueDate: '2026-11-01' }),
  todo('earlier-today', { dueDate: '2026-11-12', dueTime: '09:00' }),
  todo('today', { dueDate: '2026-11-12' }),
  todo('tomorrow', { dueDate: '2026-11-13' }),
  todo('day7', { dueDate: '2026-11-18' }),
  todo('day8', { dueDate: '2026-11-19' }),
  todo('undated'),
  todo('done-today', { dueDate: '2026-11-12', status: 'done' }),
  todo('rejected-old', { dueDate: '2026-11-01', status: 'rejected' }),
];
const ids = (xs: TodoItem[]) => xs.map((x) => x.id);

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('dueQuickPick', () => {
  it('maps quick picks to local dates', () => {
    expect(dueQuickPick('today', NOW)).toBe('2026-11-12');
    expect(dueQuickPick('tomorrow', NOW)).toBe('2026-11-13');
    // Next Monday after a Thursday.
    expect(dueQuickPick('next-week', NOW)).toBe('2026-11-16');
  });
  it('next week from a Monday is the following Monday', () => {
    expect(dueQuickPick('next-week', new Date('2026-11-16T08:00:00').getTime())).toBe('2026-11-23');
  });
});

describe('todoViewSections', () => {
  it('today: overdue section (incl. passed time today) then due today', () => {
    const s = todoViewSections(items, 'today', NOW);
    expect(s.map((x) => x.key)).toEqual(['overdue', 'today']);
    expect(ids(s[0]?.items ?? [])).toEqual(['old', 'earlier-today']);
    expect(ids(s[1]?.items ?? [])).toEqual(['today']);
  });
  it('today: no empty sections', () => {
    expect(todoViewSections([todo('a', { dueDate: '2026-11-12' })], 'today', NOW)).toHaveLength(1);
    expect(todoViewSections([], 'today', NOW)).toEqual([]);
  });
  it('tomorrow: only open items due tomorrow', () => {
    const s = todoViewSections(items, 'tomorrow', NOW);
    expect(s).toHaveLength(1);
    expect(ids(s[0]?.items ?? [])).toEqual(['tomorrow']);
  });
  it('week: today through 6 days ahead, one section per day, no overdue', () => {
    const s = todoViewSections(items, 'week', NOW);
    expect(s.map((x) => x.key)).toEqual(['2026-11-12', '2026-11-13', '2026-11-18']);
    expect(s.map((x) => x.label)).toEqual(['Today', 'Tomorrow', 'Wed, Nov 18']);
    expect(ids(s[0]?.items ?? [])).toEqual(['earlier-today', 'today']);
  });
  it('all: one section with every item in file order', () => {
    const s = todoViewSections(items, 'all', NOW);
    expect(s).toHaveLength(1);
    expect(ids(s[0]?.items ?? [])).toEqual(ids(items));
  });
});

describe('todoViewCounts', () => {
  it('counts open items per view', () => {
    expect(todoViewCounts(items, NOW)).toEqual({ today: 3, tomorrow: 1, week: 4, all: 7 });
  });
});

describe('isTodoView', () => {
  it('accepts only known views', () => {
    expect(isTodoView('week')).toBe(true);
    expect(isTodoView('later')).toBe(false);
    expect(isTodoView(null)).toBe(false);
  });
});

describe('addTodoEntry with due', () => {
  it('writes ::due:: and stays parseable', () => {
    const md = addTodoEntry('', { text: 'Pay rent', due: { date: '2026-11-13' } });
    expect(md).toContain('::due:: 2026-11-13');
    expect(parseTodos(md).items[0]?.dueDate).toBe('2026-11-13');
  });
});
