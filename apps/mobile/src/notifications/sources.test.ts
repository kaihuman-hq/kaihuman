import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_SETTINGS, planNotifications } from './planner.js';
import { todosFromSnapshot } from './sources.js';

type Items = Parameters<typeof todosFromSnapshot>[0]['items'];
const item = (over: Record<string, unknown>) =>
  ({
    id: 'a',
    filePath: 'todo.md',
    indexInFile: 0,
    text: 'Write',
    status: 'backlog',
    tags: [],
    ...over,
  }) as Items[number];
const snap = (items: Items) => ({ items, milestones: [] });
const only = (items: Items) => {
  const t = todosFromSnapshot(snap(items)).todos[0];
  if (!t) throw new Error('expected a todo');
  return t;
};

describe('todosFromSnapshot due dates', () => {
  it('lets the item own due date and time beat the milestone date', () => {
    const t = only([
      item({ milestoneDueDate: '2026-12-01', dueDate: '2026-11-10', dueTime: '14:00' }),
    ]);
    expect(t.dueDate).toBe('2026-11-10');
    expect(t.dueTime).toBe('14:00');
  });

  it('falls back to the milestone date, never carrying a time', () => {
    const t = only([item({ milestoneDueDate: '2026-12-01', dueTime: '09:00' })]);
    expect(t.dueDate).toBe('2026-12-01');
    expect(t.dueTime).toBeUndefined();
  });

  it('plans a due-soon notification minutesBefore a timed item', () => {
    const { todos } = todosFromSnapshot(
      snap([item({ milestoneDueDate: '2026-12-01', dueDate: '2026-11-10', dueTime: '14:00' })]),
    );
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true, digest: false };
    const now = Date.UTC(2026, 10, 9, 12);
    const soon = planNotifications(todos, [], settings, now, 'UTC').find(
      (n) => n.kind === 'due-soon',
    );
    expect(soon?.fireAt).toBe(Date.UTC(2026, 10, 10, 14) - settings.minutesBefore * 60_000);
  });
});

describe('todosFromSnapshot repeat', () => {
  it('parses the rule of an item with its own due date only', () => {
    expect(only([item({ dueDate: '2026-11-10', repeatRule: 'weekly:mon,thu' })]).repeat).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: [0, 3],
    });
    expect(
      only([item({ milestoneDueDate: '2026-12-01', repeatRule: 'daily' })]).repeat,
    ).toBeUndefined();
    expect(only([item({ dueDate: '2026-11-10', repeatRule: 'nonsense' })]).repeat).toBeUndefined();
  });
});
