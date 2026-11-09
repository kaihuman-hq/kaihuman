import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardOverviewView } from '../../components/widgets/tile-controllers.js';
import type { ContentFiles } from '../../screens/file-editor-screen.js';
import { BoardOverview } from './board-overview-body.js';
import type { Ctx } from './bodies.js';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('expo-router', () => ({
  useFocusEffect: () => {},
  useRouter: () => ({ push: nav.push }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOW = new Date(2026, 10, 8, 12, 0, 0);
const ctx = (content: string, apply: Ctx['apply'] = vi.fn(() => true)): Ctx => ({
  content,
  now: NOW,
  apply,
  error: null,
});

const view: BoardOverviewView = { columns: [], overdueCount: 0, files: 0 };
const files = (read: Record<string, string>): ContentFiles =>
  ({
    tree: () =>
      Object.keys(read).map((path) => ({
        path,
        mode: '100644',
        type: 'blob' as const,
        sha: path,
        url: '',
      })),
    read: async (p: string) => read[p] as string,
  }) as unknown as ContentFiles;

const todo = '# T\n\n- [ ] Write tests\n- [>] Doing it\n';

describe('BoardOverview', () => {
  it('loads .todos.md files and shows columns with counts and first items', async () => {
    render(
      <BoardOverview
        view={view}
        ctx={ctx('')}
        files={files({ 'a.todos.md': todo, 'notes.md': 'ignored' })}
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Loading boards' })).toBeTruthy();
    expect(await screen.findByText('Write tests')).toBeTruthy();
    expect(screen.getByText('1 todo file')).toBeTruthy();
    expect(screen.getByTestId('board-col-backlog')).toBeTruthy();
    expect(screen.getByTestId('board-col-in-progress')).toBeTruthy();
  });

  it('flags overdue items', async () => {
    const stuck = '# T\n\n- [>] Stuck item\n';
    render(<BoardOverview view={view} ctx={ctx('')} files={files({ 'a.todos.md': stuck })} />);
    expect(await screen.findByText('1 overdue')).toBeTruthy();
  });

  it('says so when no column is enabled', async () => {
    const none = JSON.stringify({ showBacklog: false, showInProgress: false });
    render(<BoardOverview view={view} ctx={ctx(none)} files={files({})} />);
    expect(await screen.findByText('No columns selected.')).toBeTruthy();
  });

  it('opens the board when the tile or its button is tapped', async () => {
    render(<BoardOverview view={view} ctx={ctx('')} files={files({ 'a.todos.md': todo })} />);
    fireEvent.click(await screen.findByTestId('board-open'));
    expect(nav.push).toHaveBeenCalledWith('/board');
    fireEvent.click(screen.getByRole('button', { name: 'Open board' }));
    expect(nav.push).toHaveBeenCalledTimes(2);
  });
});

describe('board settings sheet', () => {
  const open = async (content: string, apply = vi.fn(() => true)) => {
    render(<BoardOverview view={view} ctx={ctx(content, apply)} files={files({})} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Board settings' }));
    return apply;
  };
  const written = (apply: ReturnType<typeof vi.fn>) =>
    JSON.parse(apply.mock.calls.at(-1)?.[0] as string);

  it('toggles columns and writes the config', async () => {
    const apply = await open('');
    fireEvent.click(screen.getByRole('switch', { name: 'Done' }));
    expect(written(apply)).toMatchObject({ showDone: true, showBacklog: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Inbox' }));
    expect(written(apply)).toMatchObject({ showBacklog: false });
  });

  it('changes the scope', async () => {
    const apply = await open('');
    fireEvent.click(screen.getByRole('button', { name: 'Business' }));
    expect(written(apply)).toMatchObject({ scope: 'business' });
  });

  it('commits valid day counts and ignores invalid ones', async () => {
    const apply = await open('');
    fireEvent.change(screen.getByLabelText('Days in progress before overdue'), {
      target: { value: '14' },
    });
    expect(written(apply)).toMatchObject({ overdueDays: 14 });
    apply.mockClear();
    fireEvent.change(screen.getByLabelText('Days in progress before overdue'), {
      target: { value: '0' },
    });
    expect(apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Only count items older than N days (0 = all)'), {
      target: { value: '3' },
    });
    expect(written(apply)).toMatchObject({ minAgeDays: 3 });
  });

  it('hides the overdue threshold while overdue is off', async () => {
    await open(JSON.stringify({ showOverdue: false }));
    expect(screen.queryByLabelText('Days in progress before overdue')).toBeNull();
  });

  it('opens the board from the sheet', async () => {
    await open('');
    const buttons = screen.getAllByRole('button', { name: 'Open board' });
    fireEvent.click(buttons.at(-1) as HTMLElement);
    expect(nav.push).toHaveBeenCalledWith('/board');
  });
});
