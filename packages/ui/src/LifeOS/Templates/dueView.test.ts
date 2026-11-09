import type { TodoItem } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { dueBadge, matchesDueFilter, sortByDue } from './dueView';

const NOW = new Date(2026, 10, 8, 12, 0).getTime(); // 2026-11-08 12:00 local
const todo = (over: Partial<TodoItem> = {}): TodoItem => ({
  id: 'a',
  text: 't',
  status: 'backlog',
  tags: [],
  ...over,
});

describe('dueBadge', () => {
  it('is absent without a due date or when the item is closed', () => {
    expect(dueBadge(todo(), NOW)).toBeUndefined();
    expect(dueBadge(todo({ dueDate: '2026-11-01', status: 'done' }), NOW)).toBeUndefined();
  });
  it('labels overdue, today and upcoming items', () => {
    expect(dueBadge(todo({ dueDate: '2026-11-07' }), NOW)).toMatchObject({
      label: 'Overdue',
      status: 'overdue',
    });
    expect(dueBadge(todo({ dueDate: '2026-11-08', dueTime: '18:00' }), NOW)?.label).toBe('Today');
    expect(dueBadge(todo({ dueDate: '2026-11-10' }), NOW)?.label).toBe('Nov 10');
    expect(dueBadge(todo({ dueDate: '2026-11-10', dueTime: '14:00' }), NOW)?.label).toBe(
      'Nov 10 14:00',
    );
  });
  it('treats a passed time today as overdue', () => {
    expect(dueBadge(todo({ dueDate: '2026-11-08', dueTime: '09:00' }), NOW)?.label).toBe('Overdue');
  });
});

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

describe('sortByDue', () => {
  it('orders earliest first with undated last, without mutating', () => {
    const wrap = (id: string, dueDate?: string, dueTime?: string) => ({
      item: todo({ id, dueDate, dueTime }),
    });
    const input = [
      wrap('none'),
      wrap('late', '2026-12-01'),
      wrap('timed', '2026-11-10', '09:00'),
      wrap('allday', '2026-11-10'),
    ];
    expect(sortByDue(input).map((x) => x.item.id)).toEqual(['timed', 'allday', 'late', 'none']);
    expect(input[0]?.item.id).toBe('none');
  });
});
