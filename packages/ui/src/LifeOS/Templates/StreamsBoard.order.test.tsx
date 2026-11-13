// @vitest-environment jsdom
import type { TodoData, TodoItem, TodoStatus } from '@kaihuman/formats';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { type StreamFile, StreamsBoard } from './StreamsBoard';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => act(() => render(null, host)));

const item = (text: string, status: TodoStatus = 'backlog') =>
  ({ text, status, tags: [] }) as unknown as TodoItem;
const file = (path: string, ...items: TodoItem[]): StreamFile => ({
  path,
  data: { items, milestones: [] } as unknown as TodoData,
});
const noop = () => {};
const board = (files: StreamFile[], sort: 'count' | 'newest' = 'count', searchQuery = '') => (
  <StreamsBoard
    files={files}
    sort={sort}
    searchQuery={searchQuery}
    onStatusChange={noop}
    onAddItem={noop}
    onMoveItem={noop}
    onCyclePriority={noop}
    onColorChange={noop}
  />
);
const order = () =>
  [...host.querySelectorAll('button[title$=".todos.md"]')].map((b) => b.getAttribute('title'));

describe('StreamsBoard order', () => {
  it('keeps the initial order when item counts change', () => {
    act(() =>
      render(
        board([file('a.todos.md', item('1')), file('b.todos.md', item('1'), item('2'))]),
        host,
      ),
    );
    expect(order()).toEqual(['b.todos.md', 'a.todos.md']);
    // Closing both of b's items would put a first if the board re-sorted.
    act(() =>
      render(
        board([
          file('a.todos.md', item('1')),
          file('b.todos.md', item('1', 'done'), item('2', 'done')),
          file('c.todos.md', item('1'), item('2'), item('3')),
        ]),
        host,
      ),
    );
    expect(order()).toEqual(['b.todos.md', 'a.todos.md', 'c.todos.md']);
  });

  it('sorts again when the user changes the sort', () => {
    const files = [file('a.todos.md', item('1')), file('b.todos.md', item('1'), item('2'))];
    act(() => render(board(files), host));
    act(() =>
      render(board([file('a.todos.md', item('1')), file('b.todos.md', item('1', 'done'))]), host),
    );
    expect(order()).toEqual(['b.todos.md', 'a.todos.md']);
    act(() =>
      render(
        board([file('a.todos.md', item('1')), file('b.todos.md', item('1', 'done'))], 'newest'),
        host,
      ),
    );
    expect(order()).toEqual(['a.todos.md', 'b.todos.md']);
  });
});
