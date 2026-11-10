import { parseTodos } from '@kaihuman/formats';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodosDetailView, UNDO_MS } from './todos-detail-view.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = new Date(2026, 10, 10, 12, 0, 0);
const PATH = '.kh/errands.todos.md';
const FILE = `- [ ] late
::due:: 2026-11-08
- [ ] now
::due:: 2026-11-10
- [>] busy
- [ ] plain #home
- [x] finished
`;

const mount = (content = FILE) => {
  const onWrite = vi.fn();
  const onAdd = vi.fn();
  const onOpenTodo = vi.fn();
  render(
    <TodosDetailView
      path={PATH}
      content={content}
      now={NOW}
      onWrite={onWrite}
      onAdd={onAdd}
      onOpenTodo={onOpenTodo}
    />,
  );
  const written = () => parseTodos(onWrite.mock.calls.at(-1)?.[1] ?? '').items;
  return { onWrite, onAdd, onOpenTodo, written };
};

const segment = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('TodosDetailView', () => {
  it('shows the file title and counts in the segment labels', () => {
    mount();
    expect(screen.getByText('Errands')).toBeTruthy();
    for (const label of ['Today 3', 'Doing 1', 'Open 4', 'Done 1']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('groups Today into overdue, today and in progress', () => {
    mount();
    for (const h of ['OVERDUE', 'TODAY', 'IN PROGRESS']) expect(screen.getByText(h)).toBeTruthy();
    expect(screen.queryByText('plain')).toBeNull();
  });

  it('filters the other segments', () => {
    mount();
    segment('Open 4');
    expect(screen.getByText('plain')).toBeTruthy();
    expect(screen.queryByText('finished')).toBeNull();
    segment('Done 1');
    expect(screen.getByText('finished')).toBeTruthy();
    segment('Doing 1');
    expect(screen.getByText('busy')).toBeTruthy();
    expect(screen.queryByText('late')).toBeNull();
  });

  it('shows a due chip and a tag chip', () => {
    mount();
    expect(screen.getByText('Nov 8')).toBeTruthy();
    expect(screen.getByText('Tue')).toBeTruthy();
    segment('Open 4');
    expect(screen.getByText('#home')).toBeTruthy();
  });

  it('completes after the undo window, striking the row meanwhile', () => {
    vi.useFakeTimers();
    const { onWrite, written } = mount();
    fireEvent.click(screen.getByTestId('todo-check-0'));
    expect(onWrite).not.toHaveBeenCalled();
    expect(screen.getByTestId('todo-check-0').getAttribute('aria-checked')).toBe('true');
    act(() => vi.advanceTimersByTime(UNDO_MS));
    expect(written()[0]?.status).toBe('done');
  });

  it('restores the row when tapped again within the window', () => {
    vi.useFakeTimers();
    const { onWrite } = mount();
    fireEvent.click(screen.getByTestId('todo-check-0'));
    fireEvent.click(screen.getByTestId('todo-check-0'));
    act(() => vi.advanceTimersByTime(UNDO_MS * 2));
    expect(onWrite).not.toHaveBeenCalled();
    expect(screen.getByTestId('todo-check-0').getAttribute('aria-checked')).toBe('false');
  });

  it('reopens a done todo straight away', () => {
    const { written } = mount();
    segment('Done 1');
    fireEvent.click(screen.getByTestId('todo-check-4'));
    expect(written()[4]?.status).toBe('backlog');
  });

  it('opens a todo and the add sheet', () => {
    const { onOpenTodo, onAdd } = mount();
    fireEvent.click(screen.getByTestId('todo-1'));
    expect(onOpenTodo).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'New todo' }));
    expect(onAdd).toHaveBeenCalled();
  });
});
