import { describe, expect, it } from 'vitest';
import {
  actionsFor,
  filterRecent,
  matchesBoardSearch,
  matchesDueFilter,
  sortByDue,
  sortByNewest,
  sortStreams,
  streamItems,
} from './todo-board.js';
import type { TodoData, TodoItem, TodoPriority, TodoStatus } from './todos.js';

const NOW = new Date('2026-11-08T12:00:00').getTime();
const todo = (p: Partial<TodoItem> = {}): TodoItem =>
  ({ id: 'x', text: 't', status: 'backlog', tags: [], ...p }) as TodoItem;
const item = (
  text: string,
  status: TodoStatus,
  createdAt?: string,
  tags: string[] = [],
  priority?: TodoPriority,
) => todo({ text, status, createdAt, tags, priority });
const data = (...items: TodoItem[]) => ({ items, milestones: [] }) as unknown as TodoData;

describe('matchesDueFilter', () => {
  const overdue = todo({ dueDate: '2026-11-01' });
  const today = todo({ dueDate: '2026-11-08' });
  const later = todo({ dueDate: '2026-12-01' });
  const none = todo();
  const pick = (f: Parameters<typeof matchesDueFilter>[1]) =>
    [overdue, today, later, none].filter((i) => matchesDueFilter(i, f, NOW));
  it('filters by due state', () => {
    expect(pick('all')).toHaveLength(4);
    expect(pick('overdue')).toEqual([overdue]);
    expect(pick('today')).toEqual([today]);
    expect(pick('has-due')).toEqual([overdue, today, later]);
  });
});

describe('sorting', () => {
  it('sortByDue puts undated last and does not mutate', () => {
    const input = [
      { item: todo({ id: 'none' }) },
      { item: todo({ id: 'late', dueDate: '2026-12-01' }) },
      { item: todo({ id: 'soon', dueDate: '2026-11-10' }) },
    ];
    expect(sortByDue(input).map((a) => a.item.id)).toEqual(['soon', 'late', 'none']);
    expect(input[0]?.item.id).toBe('none');
  });
  it('sortByNewest orders by creation time, newest first', () => {
    const input = [
      { item: todo({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }) },
      { item: todo({ id: 'undated' }) },
      { item: todo({ id: 'new', createdAt: '2026-06-01T00:00:00Z' }) },
    ];
    expect(sortByNewest(input).map((a) => a.item.id)).toEqual(['new', 'old', 'undated']);
  });
});

describe('matchesBoardSearch', () => {
  it('matches text, tag and milestone, ignoring case and blanks', () => {
    const t = todo({ text: 'Write Docs', tags: ['Work'], milestoneId: 'v2' });
    expect(matchesBoardSearch(t, '  ')).toBe(true);
    expect(matchesBoardSearch(t, 'docs')).toBe(true);
    expect(matchesBoardSearch(t, 'wor')).toBe(true);
    expect(matchesBoardSearch(t, 'V2')).toBe(true);
    expect(matchesBoardSearch(t, 'nope')).toBe(false);
  });
});

describe('streams', () => {
  const d = data(
    item('a', 'done'),
    item('b', 'backlog'),
    item('c', 'in-progress'),
    item('Beta', 'backlog', undefined, ['Work']),
  );
  it('streamItems keeps the mode and query, with source indexes', () => {
    expect(streamItems(d, 'active', '').map((r) => r.index)).toEqual([1, 2, 3]);
    expect(streamItems(d, 'closed', '').map((r) => r.index)).toEqual([0]);
    expect(streamItems(d, 'active', 'work').map((r) => r.item.text)).toEqual(['Beta']);
  });
  it('sortStreams leads with priority, then count or newest', () => {
    const many = { path: 'many', data: data(item('1', 'backlog'), item('2', 'backlog')) };
    const urgent = { path: 'urgent', data: data(item('1', 'backlog', undefined, [], 'high')) };
    const fresh = { path: 'fresh', data: data(item('1', 'backlog', '2026-05-01T00:00:00Z')) };
    expect(sortStreams([many, fresh, urgent], 'count', 'active').map((f) => f.path)).toEqual([
      'urgent',
      'many',
      'fresh',
    ]);
    expect(sortStreams([many, fresh], 'newest', 'active').map((f) => f.path)).toEqual([
      'fresh',
      'many',
    ]);
  });
  it('actionsFor lists the other statuses', () => {
    expect(actionsFor('done')).toEqual(['backlog', 'in-progress', 'rejected']);
  });
});

describe('filterRecent', () => {
  const now = new Date('2026-11-08T12:00:00Z').getTime();
  const rows = [
    { item: todo({ id: 'fresh', updatedAt: now - 1000 }) },
    { item: todo({ id: 'stale', updatedAt: now - 30 * 86_400_000 }) },
    { item: todo({ id: 'old-created', createdAt: '2026-01-01T00:00:00Z' }) },
    { item: todo({ id: 'none' }) },
  ];
  it('drops items older than two weeks but keeps ones without a timestamp', () => {
    expect(filterRecent(rows, true, now).map((r) => r.item.id)).toEqual(['fresh', 'none']);
    expect(filterRecent(rows, false, now)).toHaveLength(4);
  });
});
