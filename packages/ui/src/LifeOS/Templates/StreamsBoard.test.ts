import type { TodoData, TodoItem, TodoPriority, TodoStatus } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { actionsFor, sortStreams, streamItems } from './StreamsBoard';

const item = (
  text: string,
  status: TodoStatus,
  createdAt?: string,
  tags: string[] = [],
  priority?: TodoPriority,
) => ({ text, status, createdAt, tags, priority }) as TodoItem;
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
  it('higher open priority always comes first, then the chosen sort', () => {
    const withPrio = [
      ...files,
      {
        path: 'd.todos.md',
        data: data(item('p', 'backlog', '2020-01-01T00:00:00Z', [], 'high')),
      },
      {
        path: 'e.todos.md',
        data: data(item('q', 'in-progress', undefined, [], 'ultra-high')),
      },
    ];
    expect(sortStreams(withPrio, 'count', 'active').map((f) => f.path)).toEqual([
      'e.todos.md',
      'd.todos.md',
      'a.todos.md',
      'b.todos.md',
      'c.todos.md',
    ]);
    expect(sortStreams(withPrio, 'newest', 'active').map((f) => f.path)).toEqual([
      'e.todos.md',
      'd.todos.md',
      'b.todos.md',
      'a.todos.md',
      'c.todos.md',
    ]);
  });
  it('priority of done items or items hidden by search does not lift a stream', () => {
    const f = [
      { path: 'a.todos.md', data: data(item('x', 'backlog'), item('y', 'backlog')) },
      {
        path: 'b.todos.md',
        data: data(item('z', 'done', undefined, [], 'ultra-high'), item('w', 'backlog')),
      },
      { path: 'c.todos.md', data: data(item('v', 'backlog', undefined, [], 'high')) },
    ];
    expect(sortStreams(f, 'count', 'active').map((x) => x.path)).toEqual([
      'c.todos.md',
      'a.todos.md',
      'b.todos.md',
    ]);
    expect(sortStreams(f, 'count', 'active', 'x').map((x) => x.path)).toEqual([
      'a.todos.md',
      'b.todos.md',
      'c.todos.md',
    ]);
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
