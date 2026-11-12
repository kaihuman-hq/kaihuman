import { configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardPage } from '../screens/dashboards.js';
import type { DashboardEditor } from './dashboard-editor.js';
import { DashboardPager } from './dashboard-pager.js';

vi.mock('../files/feed-store.js', () => ({
  feedStore: { ensure: async () => {}, snapshot: () => ({}), subscribe: () => () => {} },
}));

afterEach(cleanup);
beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const PAGES: DashboardPage[] = [
  {
    id: 'main',
    name: 'Main',
    files: [
      { path: '.kh/a.habit.csv', content: 'id,title,frequency,target,history\n' },
      { path: '.kh/b.timezones.json', content: '[]' },
    ],
  },
  { id: 'fin', name: 'Finance', files: [] },
];

function setup(over: Partial<DashboardEditor> = {}) {
  const editor = {
    tree: ['.kh/a.habit.csv', '.kh/b.timezones.json', '.kh/c.habit.csv', '.kh/x.todos.md'],
    onEdit: vi.fn(async () => {}),
    onCreateFile: vi.fn(async () => {}),
    newDashboardId: vi.fn(async () => 'd42'),
    ...over,
  };
  render(
    <DashboardPager
      pages={PAGES}
      now={NOW}
      onWrite={vi.fn()}
      onNavigate={vi.fn()}
      editor={editor}
    />,
  );
  return editor;
}
const startEditing = () => {
  fireEvent.click(screen.getByTestId('dashboard-title'));
  fireEvent.click(screen.getByTestId('dashboard-edit'));
};

/** Holds the tile long enough for react-native-web to fire onLongPress. */
const longPress = (el: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 5, clientY: 5 });
  vi.advanceTimersByTime(1000);
  fireEvent.mouseUp(el, { button: 0, clientX: 5, clientY: 5 });
  vi.useRealTimers();
};

describe('dashboard edit mode', () => {
  it('has no Edit button without an editor', () => {
    render(<DashboardPager pages={PAGES} now={NOW} onWrite={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.queryByTestId('dashboard-edit')).toBeNull();
  });

  it('keeps only search in the top bar until editing starts', () => {
    setup();
    expect(screen.getByTestId('dashboard-search')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-edit')).toBeNull();
    expect(screen.queryByTestId('dashboard-done')).toBeNull();
  });

  it('swaps the tiles for an editable list and back', () => {
    setup();
    expect(screen.queryByTestId('dashboard-edit-tiles')).toBeNull();
    startEditing();
    expect(screen.getByTestId('dashboard-edit-tiles')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tile settings, Habit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('dashboard-done'));
    expect(screen.queryByTestId('dashboard-edit-tiles')).toBeNull();
  });

  it('enters edit mode on a long-press of a square tile', () => {
    setup();
    const tile = screen.getByTestId('square-.kh/a.habit.csv');
    longPress(within(tile).getAllByRole('button')[0] as HTMLElement);
    expect(screen.getByTestId('dashboard-edit-tiles')).toBeTruthy();
  });

  it('offers search from the Today header', () => {
    const onNavigate = vi.fn();
    render(<DashboardPager pages={PAGES} now={NOW} onWrite={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('dashboard-search'));
    expect(onNavigate).toHaveBeenCalledWith('/search');
  });

  it('removes a tile', async () => {
    const editor = setup();
    startEditing();
    fireEvent.click(screen.getByTestId('remove-tile-.kh/a.habit.csv'));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([
        { type: 'removeTile', dashboard: 'main', path: '.kh/a.habit.csv' },
      ]),
    );
    expect(screen.queryByTestId('edit-tile-.kh/a.habit.csv')).toBeNull();
  });

  it('shows a failed save and restores the list', async () => {
    setup({ onEdit: vi.fn(async () => Promise.reject(new Error('Offline'))) });
    startEditing();
    fireEvent.click(screen.getByTestId('remove-tile-.kh/a.habit.csv'));
    expect((await screen.findByTestId('dashboard-edit-error')).textContent).toBe('Offline');
    expect(screen.getByTestId('edit-tile-.kh/a.habit.csv')).toBeTruthy();
  });

  it('moves a tile to another dashboard from its settings', async () => {
    const editor = setup();
    startEditing();
    fireEvent.click(screen.getByTestId('tile-settings-.kh/b.timezones.json'));
    fireEvent.click(await screen.findByTestId('move-to-fin'));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([
        { type: 'moveTile', dashboard: 'main', path: '.kh/b.timezones.json', to: 'fin' },
      ]),
    );
  });

  it('adds an existing file of the chosen kind, not one already on the page', async () => {
    const editor = setup();
    startEditing();
    fireEvent.click(screen.getByTestId('add-tile'));
    fireEvent.click(await screen.findByTestId('add-kind-habit'));
    expect(screen.queryByTestId('add-file-.kh/a.habit.csv')).toBeNull();
    fireEvent.click(screen.getByTestId('add-file-.kh/c.habit.csv'));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([
        { type: 'addTile', dashboard: 'main', path: '.kh/c.habit.csv' },
      ]),
    );
  });

  it('creates a new file with its starter and adds it', async () => {
    const editor = setup();
    startEditing();
    fireEvent.click(screen.getByTestId('add-tile'));
    fireEvent.click(await screen.findByTestId('add-kind-todos'));
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'work' } });
    fireEvent.click(screen.getByTestId('create-tile'));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([
        { type: 'addTile', dashboard: 'main', path: '.kh/work.todos.md' },
      ]),
    );
    expect(editor.onCreateFile).toHaveBeenCalledWith('.kh/work.todos.md', '- [ ] New Task');
  });

  it('creates a new file in a typed subfolder, prefilled with today', async () => {
    const editor = setup();
    startEditing();
    fireEvent.click(screen.getByTestId('add-tile'));
    fireEvent.click(await screen.findByTestId('add-kind-todos'));
    expect((screen.getByLabelText('File name') as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'lists/work/' } });
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'Q4 Plan' } });
    expect(screen.getByText('A new folder is created.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('create-tile'));
    await waitFor(() =>
      expect(editor.onCreateFile).toHaveBeenCalledWith(
        'lists/work/q4-plan.todos.md',
        '- [ ] New Task',
      ),
    );
  });

  it('manages dashboards: add, rename, move and confirm delete', async () => {
    const editor = setup();
    startEditing();
    fireEvent.click(screen.getByTestId('dashboard-manage'));
    fireEvent.change(screen.getByLabelText('New dashboard'), { target: { value: 'Reading' } });
    fireEvent.click(screen.getByTestId('add-dashboard'));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([
        { type: 'addDashboard', id: 'd42', name: 'Reading' },
      ]),
    );

    fireEvent.click(screen.getByTestId('rename-fin'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Money' } });
    fireEvent.click(screen.getByTestId('rename-save-fin'));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([
        { type: 'renameDashboard', id: 'fin', name: 'Money' },
      ]),
    );

    fireEvent.click(screen.getByTestId('dashboard-up-fin'));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([{ type: 'moveDashboard', id: 'fin', to: 0 }]),
    );

    fireEvent.click(screen.getByTestId('dashboard-delete-main'));
    expect(editor.onEdit).not.toHaveBeenCalledWith([{ type: 'deleteDashboard', id: 'main' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Main' }));
    await waitFor(() =>
      expect(editor.onEdit).toHaveBeenCalledWith([{ type: 'deleteDashboard', id: 'main' }]),
    );
  });
});
