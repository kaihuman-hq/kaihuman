import type { TaskList, TodoItem } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { taskSections } from './tasks.js';
import { rescheduleChoices } from './todo-due.js';

const NOW = new Date(2026, 10, 13, 12).getTime(); // Friday
const INBOX = 'kh/inbox.todos.md';
const todo = (id: string, p: Partial<TodoItem> = {}): TodoItem =>
  ({ id, text: id, status: 'backlog', tags: [], ...p }) as TodoItem;
const lists: TaskList[] = [
  {
    path: INBOX,
    name: 'Inbox',
    items: [
      todo('late', { dueDate: '2026-11-10' }),
      todo('now', { dueDate: '2026-11-13', dueTime: '09:00' }),
      todo('soon', { dueDate: '2026-11-14' }),
      todo('done', { status: 'done' }),
    ],
  },
];

describe('taskSections', () => {
  it('splits the week view into ordered due buckets with write addresses', () => {
    const s = taskSections(lists, 'week', INBOX, NOW);
    expect(s.map((x) => [x.label, x.entries.map((e) => e.item.id)])).toEqual([
      ['Overdue', ['late']],
      ['Today', ['now']],
      ['Tomorrow', ['soon']],
    ]);
    expect(s[2]?.entries[0]).toMatchObject({ filePath: INBOX, itemIndex: 2, listName: 'Inbox' });
  });

  it('lists completed flat', () => {
    const s = taskSections(lists, 'completed', INBOX, NOW);
    expect(s).toHaveLength(1);
    expect(s[0]?.entries.map((e) => e.item.id)).toEqual(['done']);
  });

  it('is empty with nothing to show', () => {
    expect(taskSections([], 'today', INBOX, NOW)).toEqual([]);
  });
});

describe('rescheduleChoices', () => {
  const now = new Date(2026, 10, 13, 12); // Friday
  const due = (id: string, time?: string) =>
    rescheduleChoices(time)
      .find((c) => c.id === id)
      ?.due(now);
  it('offers the four quick options, next occurrence strictly after today', () => {
    expect(rescheduleChoices().map((c) => c.label)).toEqual([
      'Tomorrow',
      'Day after tomorrow',
      'Next Saturday',
      'Next Monday',
    ]);
    expect(due('tomorrow')).toEqual({ date: '2026-11-14' });
    expect(due('day-after')).toEqual({ date: '2026-11-15' });
    expect(due('saturday')).toEqual({ date: '2026-11-14' });
    expect(due('monday')).toEqual({ date: '2026-11-16' });
  });
  it('keeps the time of day', () => {
    expect(due('monday', '09:30')).toEqual({ date: '2026-11-16', time: '09:30' });
  });
});
