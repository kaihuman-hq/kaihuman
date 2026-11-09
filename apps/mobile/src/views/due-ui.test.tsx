import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoardController } from '../screens/kanban-board.js';
import type { RepoFiles } from '../screens/quick-capture.js';
import { DueEditor } from './due-editor.js';
import { DueSheet } from './due-sheet.js';
import { KanbanView } from './kanban-view.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 10, 12, 0);

describe('DueSheet', () => {
  it('offers Today and Tomorrow, and only offers Clear when a due is set', () => {
    const onSelect = vi.fn();
    const { unmount } = render(
      <DueSheet
        title="Pay rent"
        current={undefined}
        onSelect={onSelect}
        onClose={vi.fn()}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByTestId('due-today'));
    expect(onSelect).toHaveBeenLastCalledWith({ date: '2026-11-10' });
    fireEvent.click(screen.getByTestId('due-tomorrow'));
    expect(onSelect).toHaveBeenLastCalledWith({ date: '2026-11-11' });
    expect(screen.queryByTestId('due-clear-all')).toBeNull();
    unmount();

    render(
      <DueSheet
        title="Pay rent"
        current={{ date: '2026-11-12' }}
        onSelect={onSelect}
        onClose={vi.fn()}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByTestId('due-clear-all'));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it('opens the native picker for Pick…', () => {
    render(
      <DueSheet
        title="Pay rent"
        current={undefined}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByTestId('due-pick'));
    fireEvent.click(screen.getByTestId('due-date'));
    expect(screen.getByTestId('due-picker').getAttribute('data-mode')).toBe('date');
  });
});

describe('DueEditor', () => {
  it('shows the due, a time toggle, and clears', () => {
    const onChange = vi.fn();
    render(<DueEditor value={{ date: '2026-11-12' }} onChange={onChange} now={NOW} />);
    expect(screen.getByText('Nov 12, 2026')).toBeTruthy();
    expect(screen.getByTestId('due-time-toggle')).toBeTruthy();
    fireEvent.click(screen.getByTestId('due-clear'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe('board due badge', () => {
  it('shows an overdue badge on a card with a past due date', async () => {
    const files: RepoFiles = {
      appFolder: () => '.kh',
      exists: () => true,
      todoPaths: () => ['.kh/inbox.todos.md'],
      read: async () => '- [ ] Pay rent\n  ::due:: 2020-01-02\n- [ ] Plain\n',
      write: async () => {},
    };
    render(<KanbanView controller={new KanbanBoardController(files)} />);
    await waitFor(() => expect(screen.getByText('Overdue · Jan 2')).toBeTruthy());
    expect(screen.getAllByText(/Overdue/)).toHaveLength(1);
  });
});
