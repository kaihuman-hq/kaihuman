import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoardController } from '../screens/kanban-board.js';
import type { RepoFiles } from '../screens/quick-capture.js';
import { rescheduleChoices } from '../screens/todo-due.js';
import { DueSheet } from './due-sheet.js';
import { TasksView } from './tasks-view.js';

afterEach(cleanup);

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const files = (content: string): RepoFiles & { write: ReturnType<typeof vi.fn> } =>
  ({
    appFolder: () => 'kh',
    todoPaths: () => ['kh/inbox.todos.md'],
    read: async () => content,
    write: vi.fn(async () => {}),
  }) as any;

describe('DueSheet presets', () => {
  it('shows the reschedule choices', () => {
    const onSelect = vi.fn();
    render(
      <DueSheet
        title="x"
        current={undefined}
        presets={rescheduleChoices()}
        onSelect={onSelect}
        onClose={vi.fn()}
        now={new Date(2026, 10, 13, 12)}
      />,
    );
    expect(screen.queryByTestId('due-today')).toBeNull();
    fireEvent.click(screen.getByTestId('due-day-after'));
    expect(onSelect).toHaveBeenLastCalledWith({ date: '2026-11-15' });
    expect(screen.getByTestId('due-pick')).toBeTruthy();
  });
});

describe('TasksView', () => {
  it('groups tasks by due bucket and reschedules from the sheet', async () => {
    const f = files(`- [ ] pay rent\n  ::due:: ${today}\n`);
    const controller = new KanbanBoardController(f);
    render(<TasksView controller={controller} />);
    await waitFor(() => expect(screen.getByText(/^Today · 1/)).toBeTruthy());
    fireEvent.click(screen.getByTestId('task-0'));
    fireEvent.click(screen.getByTestId('due-tomorrow'));
    await waitFor(() => expect(f.write).toHaveBeenCalled());
  });
});
