import type { TodoItem } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { dueNotificationKey, dueTodos, pruneNotified } from './due-notifications';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();

const item = (over: Partial<TodoItem>): TodoItem => ({
  id: '1',
  text: 'x',
  status: 'backlog',
  tags: [],
  ...over,
});

const row = (i: TodoItem, path = 'a.todos.md') => ({ path, item: i });

describe('dueTodos', () => {
  const now = at(2026, 5, 10, 12, 0);

  it('returns timed todos whose time has passed', () => {
    const r = dueTodos([row(item({ dueDate: '2026-05-10', dueTime: '11:30' }))], now, new Set());
    expect(r).toHaveLength(1);
  });

  it('skips todos not yet due, undated, done or rejected', () => {
    const rows = [
      row(item({ id: '1', dueDate: '2026-05-10', dueTime: '12:30' })),
      row(item({ id: '2' })),
      row(item({ id: '3', dueDate: '2026-05-10', dueTime: '08:00', status: 'done' })),
      row(item({ id: '4', dueDate: '2026-05-10', dueTime: '08:00', status: 'rejected' })),
    ];
    expect(dueTodos(rows, now, new Set())).toEqual([]);
  });

  it('treats all-day todos as due from 09:00', () => {
    const r = row(item({ dueDate: '2026-05-10' }));
    expect(dueTodos([r], at(2026, 5, 10, 8, 59), new Set())).toEqual([]);
    expect(dueTodos([r], at(2026, 5, 10, 9, 0), new Set())).toHaveLength(1);
  });

  it('ignores todos overdue by more than a day', () => {
    const r = row(item({ dueDate: '2026-05-08', dueTime: '09:00' }));
    expect(dueTodos([r], now, new Set())).toEqual([]);
  });

  it('skips already-notified keys', () => {
    const r = row(item({ dueDate: '2026-05-10', dueTime: '11:30' }));
    expect(dueTodos([r], now, new Set([dueNotificationKey(r)]))).toEqual([]);
  });

  it('key changes when the due date changes (reschedule notifies again)', () => {
    const a = row(item({ dueDate: '2026-05-10', dueTime: '11:30' }));
    const b = row(item({ dueDate: '2026-05-10', dueTime: '11:45' }));
    expect(dueNotificationKey(a)).not.toBe(dueNotificationKey(b));
  });
});

describe('pruneNotified', () => {
  it('keeps only the newest N keys', () => {
    expect(pruneNotified(['a', 'b', 'c'], 2)).toEqual(['b', 'c']);
  });
});
