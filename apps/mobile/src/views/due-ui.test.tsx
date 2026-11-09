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

describe('repeat editor', () => {
  it('is only offered with a due date and a repeat handler', () => {
    const { unmount } = render(
      <DueEditor value={undefined} onChange={vi.fn()} onRepeatChange={vi.fn()} now={NOW} />,
    );
    expect(screen.queryByTestId('repeat-summary')).toBeNull();
    unmount();
    render(<DueEditor value={{ date: '2026-11-12' }} onChange={vi.fn()} now={NOW} />);
    expect(screen.queryByTestId('repeat-summary')).toBeNull();
  });

  it('picks a preset pinned to the due date', () => {
    const onRepeat = vi.fn();
    render(
      <DueEditor
        value={{ date: '2026-11-12' }}
        onChange={vi.fn()}
        onRepeatChange={onRepeat}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('repeat-summary').textContent).toBe('Does not repeat');
    expect(screen.queryByTestId('repeat-more')).toBeNull();
    fireEvent.click(screen.getByLabelText('Repeat Weekly'));
    expect(onRepeat).toHaveBeenLastCalledWith({ unit: 'week', interval: 1, weekdays: [3] });
    fireEvent.click(screen.getByLabelText('Repeat Monthly'));
    expect(onRepeat).toHaveBeenLastCalledWith({ unit: 'month', interval: 1, day: 12 });
  });

  it('steps the interval, toggles weekdays and returns to None', () => {
    const onRepeat = vi.fn();
    render(
      <DueEditor
        value={{ date: '2026-11-12' }}
        onChange={vi.fn()}
        repeat={{ unit: 'week', interval: 2, weekdays: [3] }}
        onRepeatChange={onRepeat}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('repeat-every').textContent).toBe('Every 2 weeks');
    expect(screen.getByTestId('repeat-summary').textContent).toBe('Every 2 weeks on Thu');
    fireEvent.click(screen.getByTestId('repeat-more'));
    expect(onRepeat).toHaveBeenLastCalledWith({ unit: 'week', interval: 3, weekdays: [3] });
    fireEvent.click(screen.getByTestId('repeat-less'));
    expect(onRepeat).toHaveBeenLastCalledWith({ unit: 'week', interval: 1, weekdays: [3] });
    fireEvent.click(screen.getByLabelText('On Mon'));
    expect(onRepeat).toHaveBeenLastCalledWith({ unit: 'week', interval: 2, weekdays: [0, 3] });
    // The only selected day stays selected.
    onRepeat.mockClear();
    fireEvent.click(screen.getByLabelText('On Thu'));
    expect(onRepeat).toHaveBeenLastCalledWith({ unit: 'week', interval: 2, weekdays: [3] });
    fireEvent.click(screen.getByLabelText('Repeat None'));
    expect(onRepeat).toHaveBeenLastCalledWith(undefined);
  });

  it('the board sheet saves the picked repeat with the date', () => {
    const onSelect = vi.fn();
    render(
      <DueSheet
        title="Water plants"
        current={{ date: '2026-11-12' }}
        onSelect={onSelect}
        onClose={vi.fn()}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByTestId('due-pick'));
    fireEvent.click(screen.getByLabelText('Repeat Daily'));
    fireEvent.click(screen.getByTestId('due-save'));
    expect(onSelect).toHaveBeenLastCalledWith({ date: '2026-11-12' }, { unit: 'day', interval: 1 });
  });

  it('marks recurring cards on the board with a labelled icon', async () => {
    const files: RepoFiles = {
      appFolder: () => '.kh',
      exists: () => true,
      todoPaths: () => ['.kh/inbox.todos.md'],
      read: async () =>
        '- [ ] Water plants\n  ::due:: 2099-01-02 ::repeat:: weekly:fri\n- [ ] Plain\n  ::due:: 2099-01-02\n',
      write: async () => {},
    };
    render(<KanbanView controller={new KanbanBoardController(files)} />);
    await waitFor(() => expect(screen.getByLabelText('Repeats Weekly on Fri')).toBeTruthy());
    expect(screen.getAllByLabelText(/^Repeats/)).toHaveLength(1);
  });
});
