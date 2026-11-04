import type { TodoData, TodoItem, TodoStatus } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { actionsFor, sortStreams, streamItems } from './StreamsBoard';

const item = (text: string, status: TodoStatus, createdAt?: string, tags: string[] = []) =>
  ({ text, status, createdAt, tags }) as TodoItem;
const data = (...items: TodoItem[]) => ({ items, milestones: [] }) as unknown as TodoData;

describe('streamItems', () => {
  const d = data(
    item('a', 'done'),
    item('b', 'backlog'),
    item('c', 'in-progress'),
    item('d', 'rejected'),
    item('Beta', 'backlog', undefined, ['Work']),
  );
  it('active keeps backlog + in-progress with original indexes', () => {
    expect(streamItems(d, 'active', '').map((r) => r.index)).toEqual([1, 2, 4]);
  });
  it('closed keeps done + rejected', () => {
    expect(streamItems(d, 'closed', '').map((r) => r.index)).toEqual([0, 3]);
  });
  it('filters by text or tag, case-insensitively', () => {
    expect(streamItems(d, 'active', ' BETA ').map((r) => r.index)).toEqual([4]);
    expect(streamItems(d, 'active', 'work').map((r) => r.index)).toEqual([4]);
  });
});

describe('sortStreams', () => {
  const files = [
    { path: 'b.todos.md', data: data(item('x', 'backlog', '2026-01-01T00:00:00Z')) },
    {
      path: 'a.todos.md',
      data: data(item('x', 'backlog', '2025-01-01T00:00:00Z'), item('y', 'backlog')),
    },
    { path: 'c.todos.md', data: data(item('x', 'done', '2026-06-01T00:00:00Z')) },
  ];
  it('count: most visible items first, ties by path', () => {
    expect(sortStreams(files, 'count', 'active').map((f) => f.path)).toEqual([
      'a.todos.md',
      'b.todos.md',
      'c.todos.md',
    ]);
  });
  it('newest: latest createdAt of visible items first', () => {
    expect(sortStreams(files, 'newest', 'active').map((f) => f.path)).toEqual([
      'b.todos.md',
      'a.todos.md',
      'c.todos.md',
    ]);
    expect(sortStreams(files, 'newest', 'closed')[0]?.path).toBe('c.todos.md');
  });
  it('does not mutate the input', () => {
    const copy = [...files];
    sortStreams(files, 'count', 'active');
    expect(files).toEqual(copy);
  });
});

describe('actionsFor', () => {
  it('offers every status except the current one', () => {
    expect(actionsFor('backlog')).toEqual(['in-progress', 'done', 'rejected']);
    expect(actionsFor('done')).toEqual(['backlog', 'in-progress', 'rejected']);
  });
});
