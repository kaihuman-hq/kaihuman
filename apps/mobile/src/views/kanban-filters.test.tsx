import { parseTodos } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoardController } from '../screens/kanban-board.js';
import type { RepoFiles } from '../screens/quick-capture.js';
import { KanbanView } from './kanban-view.js';

afterEach(cleanup);

class MemoryFiles implements RepoFiles {
  constructor(public store: Map<string, string>) {}
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    this.store.set(p, c);
  }
}

const INBOX = [
  '- [ ] pay rent #home',
  '::due:: 2020-01-01',
  '- [ ] write docs #work',
  '- [ ] water plants #home',
  '::due:: 2999-01-01',
  '- [>] ship it #work',
  '- [x] old thing',
].join('\n');
const SIDE = '- [ ] side quest\n- [ ] side two\n';

const files = () =>
  new MemoryFiles(
    new Map([
      ['.kh/inbox.todos.md', INBOX],
      ['.kh/side.todos.md', SIDE],
    ]),
  );

const loaded = async (f = files()) => {
  const c = new KanbanBoardController(f);
  await c.load();
  return { c, f };
};
const texts = (c: KanbanBoardController, s: 'backlog' | 'in-progress' = 'backlog') =>
  c.columns()[s].map((b) => b.item.text);

describe('KanbanBoardController filters', () => {
  it('searches text, tags and milestones', async () => {
    const { c } = await loaded();
    c.setFilter({ search: 'HOME' });
    expect(texts(c)).toEqual(['pay rent', 'water plants']);
    c.setFilter({ search: 'side' });
    expect(texts(c)).toEqual(['side quest', 'side two']);
  });

  it('filters by due state and restricts to files', async () => {
    const { c } = await loaded();
    c.setFilter({ due: 'overdue' });
    expect(texts(c)).toEqual(['pay rent']);
    c.setFilter({ due: 'has-due' });
    expect(texts(c)).toHaveLength(2);
    c.setFilter({ files: ['.kh/side.todos.md'] });
    expect(texts(c)).toEqual(['side quest', 'side two']);
  });

  it('sorts a column by due date with undated last', async () => {
    const { c } = await loaded();
    c.setFilter({ sort: 'due' });
    expect(texts(c).slice(0, 2)).toEqual(['pay rent', 'water plants']);
  });

  it('scopes to the upcoming milestone', async () => {
    const f = files();
    f.store.set(
      '.kh/inbox.todos.md',
      '---\nmilestones:\n  - id: v2\n    name: V2\n    dueDate: 2999-01-01\n---\n\n- [ ] in v2 !v2\n- [ ] loose\n',
    );
    const { c } = await loaded(f);
    expect(c.upcomingMilestone?.id).toBe('v2');
    c.setFilter({ upcoming: true });
    expect(texts(c)).toEqual(['in v2']);
  });

  it('builds streams for the mode and search, and cycles priority', async () => {
    const { c, f } = await loaded();
    expect(c.streams('active', 'count').map((s) => s.path)).toEqual([
      '.kh/inbox.todos.md',
      '.kh/side.todos.md',
    ]);
    expect(c.streams('closed', 'count')[0]?.rows.map((r) => r.item.text)).toEqual(['old thing']);
    c.setFilter({ search: 'side' });
    expect(c.streams('active', 'count')[0]?.path).toBe('.kh/side.todos.md');
    expect(c.streams('active', 'count')[1]?.rows).toEqual([]);

    expect((await c.cyclePriority('.kh/side.todos.md', 1)).ok).toBe(true);
    expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').items[1]?.priority).toBe('high');
    // A prioritised stream now leads regardless of item count.
    c.setFilter({});
    expect(c.streams('active', 'count')[0]?.path).toBe('.kh/side.todos.md');
  });
});

describe('KanbanView search, filters and streams', () => {
  it('filters cards from the search field', async () => {
    render(<KanbanView controller={new KanbanBoardController(files())} />);
    await waitFor(() => expect(screen.getByText('write docs')).toBeTruthy());
    fireEvent.change(screen.getByTestId('board-search'), { target: { value: 'rent' } });
    await waitFor(() => expect(screen.queryByText('write docs')).toBeNull());
    expect(screen.getByText('pay rent')).toBeTruthy();
  });

  it('applies due filters from the bottom sheet and resets them', async () => {
    render(<KanbanView controller={new KanbanBoardController(files())} />);
    await waitFor(() => expect(screen.getByText('write docs')).toBeTruthy());
    fireEvent.click(screen.getByTestId('board-filter'));
    fireEvent.click(screen.getByText('Overdue'));
    fireEvent.click(screen.getByTestId('filter-done'));
    await waitFor(() => expect(screen.queryByText('write docs')).toBeNull());
    expect(screen.getByText('pay rent')).toBeTruthy();
    expect(screen.getByLabelText('Sort and filter, 1 active')).toBeTruthy();
    fireEvent.click(screen.getByTestId('board-filter'));
    fireEvent.click(screen.getByTestId('filter-reset'));
    fireEvent.click(screen.getByTestId('filter-done'));
    await waitFor(() => expect(screen.getByText('write docs')).toBeTruthy());
  });

  it('switches to streams, adds an item and changes status and priority', async () => {
    const f = files();
    render(<KanbanView controller={new KanbanBoardController(f)} />);
    await waitFor(() => expect(screen.getByText('write docs')).toBeTruthy());
    fireEvent.click(screen.getByText('Streams'));
    await waitFor(() => expect(screen.getByText('side quest')).toBeTruthy());
    expect(screen.getByText('side · 2')).toBeTruthy();

    const add = screen.getByTestId('stream-add-side');
    fireEvent.change(add, { target: { value: 'third' } });
    fireEvent.keyDown(add, { key: 'Enter', code: 'Enter', keyCode: 13 });
    await waitFor(() =>
      expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').items.map((i) => i.text)).toContain(
        'third',
      ),
    );

    fireEvent.click(
      within(screen.getByTestId('stream-card-side-0')).getByLabelText(/^Priority none/),
    );
    await waitFor(() =>
      expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').items[0]?.priority).toBe('high'),
    );
  });

  it('shows closed items when the stream mode is switched in the sheet', async () => {
    render(<KanbanView controller={new KanbanBoardController(files())} />);
    await waitFor(() => expect(screen.getByText('write docs')).toBeTruthy());
    fireEvent.click(screen.getByText('Streams'));
    fireEvent.click(screen.getByTestId('board-filter'));
    fireEvent.click(screen.getByText('Closed'));
    fireEvent.click(screen.getByTestId('filter-done'));
    await waitFor(() => expect(screen.getByText('old thing')).toBeTruthy());
    expect(screen.queryByText('write docs')).toBeNull();
  });
});

describe('KanbanBoardController colour, reorder and recent filter', () => {
  it('persists a stream colour in the file and clears it', async () => {
    const { c, f } = await loaded();
    expect((await c.setColor('.kh/side.todos.md', 'sky')).ok).toBe(true);
    expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').color).toBe('sky');
    await c.setColor('.kh/side.todos.md', undefined);
    expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').color).toBeUndefined();
  });

  it('moves an item within its file and rejects a bad position', async () => {
    const { c, f } = await loaded();
    expect((await c.moveItem('.kh/side.todos.md', 1, 0)).ok).toBe(true);
    expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').items.map((i) => i.text)).toEqual([
      'side two',
      'side quest',
    ]);
    expect((await c.moveItem('.kh/side.todos.md', 0, 9)).ok).toBe(false);
  });

  it('limits a column to the last two weeks', async () => {
    const f = files();
    const old = Date.now() - 30 * 86_400_000;
    f.store.set(
      '.kh/inbox.todos.md',
      `- [x] stale\n::updated:: ${old}\n- [x] fresh\n::updated:: ${Date.now()}\n`,
    );
    const { c } = await loaded(f);
    expect(c.columns().done).toHaveLength(2);
    c.setFilter({ recent: { done: true } });
    expect(c.columns().done.map((b) => b.item.text)).toEqual(['fresh']);
  });
});

describe('KanbanView colour, reorder and recent chip', () => {
  it('picks a stream colour from the swatches', async () => {
    const f = files();
    render(<KanbanView controller={new KanbanBoardController(f)} />);
    await waitFor(() => expect(screen.getByText('write docs')).toBeTruthy());
    fireEvent.click(screen.getByText('Streams'));
    await waitFor(() => expect(screen.getByTestId('stream-color-side')).toBeTruthy());
    fireEvent.click(screen.getByTestId('stream-color-side'));
    fireEvent.click(screen.getByTestId('color-teal'));
    await waitFor(() =>
      expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').color).toBe('teal'),
    );
  });

  it('reorders from the long-press menu', async () => {
    const f = files();
    render(<KanbanView controller={new KanbanBoardController(f)} />);
    await waitFor(() => expect(screen.getByText('write docs')).toBeTruthy());
    fireEvent.click(screen.getByText('Streams'));
    await waitFor(() => expect(screen.getByTestId('stream-card-side-1')).toBeTruthy());
    vi.useFakeTimers();
    fireEvent.mouseDown(screen.getByTestId('stream-card-side-1'), {
      button: 0,
      buttons: 1,
      clientX: 5,
      clientY: 5,
    });
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    fireEvent.click(await screen.findByTestId('move-top'));
    await waitFor(() =>
      expect(parseTodos(f.store.get('.kh/side.todos.md') ?? '').items[0]?.text).toBe('side two'),
    );
  });

  it('toggles the 2W chip for the current column', async () => {
    const f = files();
    const old = Date.now() - 30 * 86_400_000;
    f.store.set('.kh/inbox.todos.md', `- [x] stale\n::updated:: ${old}\n- [ ] open\n`);
    render(<KanbanView controller={new KanbanBoardController(f)} />);
    await waitFor(() => expect(screen.getByText('open')).toBeTruthy());
    fireEvent.click(screen.getByText('Done 0'));
    expect(screen.queryByText('stale')).toBeNull();
    fireEvent.click(screen.getByText('Last 2 weeks'));
    await waitFor(() => expect(screen.getByText('stale')).toBeTruthy());
  });
});
