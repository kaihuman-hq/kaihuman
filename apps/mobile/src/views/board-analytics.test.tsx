import { parseTodos } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoardController } from '../screens/kanban-board.js';
import type { RepoFiles } from '../screens/quick-capture.js';
import { TodoAnalyticsController } from '../screens/todo-analytics.js';
import { KanbanView } from './kanban-view.js';
import { TodoAnalyticsView } from './todo-analytics-view.js';

afterEach(cleanup);

class MemoryFiles implements RepoFiles {
  constructor(public store = new Map<string, string>()) {}
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    this.store.set(p, c);
  }
}

const PATH = '.kh/inbox.todos.md';
const files = (text: string) => new MemoryFiles(new Map([[PATH, text]]));

describe('KanbanView', () => {
  it('advances a card with the trailing button and updates the file', async () => {
    const f = files('- [ ] write tests #qa\n- [ ] plan #ops\n');
    render(<KanbanView controller={new KanbanBoardController(f)} />);
    await waitFor(() => expect(screen.getByText('write tests')).toBeTruthy());
    expect(screen.getByLabelText('Start: write tests')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Start: write tests'));
    await waitFor(() => expect(screen.getByText('Todo 1')).toBeTruthy());
    expect(parseTodos(f.store.get(PATH) ?? '').items[0]?.status).toBe('in-progress');
  });

  it('switches column and shows its empty state', async () => {
    render(<KanbanView controller={new KanbanBoardController(files('- [ ] a\n'))} />);
    await waitFor(() => expect(screen.getByText('a')).toBeTruthy());
    fireEvent.click(screen.getByText('Done 0'));
    expect(screen.getByText('Nothing done yet')).toBeTruthy();
  });

  it('filters by tag', async () => {
    render(
      <KanbanView controller={new KanbanBoardController(files('- [ ] a #x\n- [ ] b #y\n'))} />,
    );
    await waitFor(() => expect(screen.getByText('a')).toBeTruthy());
    fireEvent.click(screen.getByTestId('board-filters-toggle'));
    fireEvent.click(screen.getAllByText('#y')[0] as HTMLElement);
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.getByText('b')).toBeTruthy();
    fireEvent.click(screen.getByText('All'));
    expect(screen.getByText('a')).toBeTruthy();
  });

  it('shows a retryable error when loading fails', async () => {
    const controller = new KanbanBoardController(files(''));
    vi.spyOn(controller, 'load').mockRejectedValueOnce(new Error('offline'));
    render(<KanbanView controller={controller} />);
    await waitFor(() => expect(screen.getByText("Couldn't load the board")).toBeTruthy());
    expect(screen.getByText('offline')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.queryByText("Couldn't load the board")).toBeNull());
  });

  it('offers add todo from the empty backlog', async () => {
    const onAddTodo = vi.fn();
    render(<KanbanView controller={new KanbanBoardController(files(''))} onAddTodo={onAddTodo} />);
    await waitFor(() => expect(screen.getByText('Backlog is clear')).toBeTruthy());
    fireEvent.click(screen.getAllByText('Add todo')[0] as HTMLElement);
    expect(onAddTodo).toHaveBeenCalled();
  });
});

describe('TodoAnalyticsView', () => {
  it('labels stats, status counts and tags', async () => {
    render(
      <TodoAnalyticsView
        controller={new TodoAnalyticsController(files('- [ ] a #x\n- [x] b #x\n'))}
      />,
    );
    await waitFor(() => expect(screen.getByText('Completion')).toBeTruthy());
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByLabelText('Backlog, 1')).toBeTruthy();
    expect(screen.getByLabelText('#x, 2')).toBeTruthy();
  });

  it('shows an empty state without todos', async () => {
    render(<TodoAnalyticsView controller={new TodoAnalyticsController(files(''))} />);
    await waitFor(() => expect(screen.getByText('No todos yet')).toBeTruthy());
  });
});
