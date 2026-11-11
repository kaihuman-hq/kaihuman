import { buildDemoSeed, configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as controllers from '../components/widgets/tile-controllers.js';
import { type DashboardPage, loadDashboards } from '../screens/dashboards.js';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { DashboardPager } from './dashboard-pager.js';

const feeds = vi.hoisted(() => {
  let snap: Record<string, unknown> = {};
  const listeners = new Set<() => void>();
  return {
    ensure: vi.fn(async () => {}),
    set(next: Record<string, unknown>) {
      snap = next;
      for (const fn of listeners) fn();
    },
    snapshot: () => snap,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
});
vi.mock('../files/feed-store.js', () => ({ feedStore: feeds }));

afterEach(() => {
  cleanup();
  feeds.set({});
  vi.restoreAllMocks();
});
beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const seed = buildDemoSeed(NOW).files;

async function demoPages(): Promise<DashboardPage[]> {
  const files = {
    tree: () => Object.keys(seed).map((path) => ({ path, type: 'blob' }) as never),
    read: async (p: string) => seed[p] as string,
  } as unknown as ContentFiles;
  return (await loadDashboards(files)).pages;
}

const setup = async (extra: Partial<Parameters<typeof DashboardPager>[0]> = {}) => {
  const onNavigate = vi.fn();
  const pages = await demoPages();
  render(
    <DashboardPager pages={pages} now={NOW} onWrite={vi.fn()} onNavigate={onNavigate} {...extra} />,
  );
  return { onNavigate, pages };
};

describe('DashboardPager with the demo seed', () => {
  it('shows the first dashboard name and page dots', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'Choose dashboard, current Overview' })).toBeTruthy();
    expect(screen.getByLabelText('Page 1 of 4')).toBeTruthy();
  });

  it('lists dashboards in the menu and jumping changes the title', async () => {
    await setup();
    fireEvent.click(screen.getByTestId('dashboard-title'));
    const menu = screen.getByTestId('dashboard-menu');
    for (const name of ['Overview', 'Finance', 'Reading', 'Tools'])
      expect(within(menu).getByRole('button', { name })).toBeTruthy();
    expect(
      within(screen.getByTestId('dashboard-option-overview')).queryByText('Finance'),
    ).toBeNull();
    fireEvent.click(screen.getByTestId('dashboard-option-finance'));
    expect(screen.getByRole('button', { name: 'Choose dashboard, current Finance' })).toBeTruthy();
    expect(screen.getByLabelText('Page 2 of 4')).toBeTruthy();
  });

  it('remembers the chosen dashboard', async () => {
    await setup();
    fireEvent.click(screen.getByTestId('dashboard-title'));
    fireEvent.click(screen.getByTestId('dashboard-option-reading'));
    cleanup();
    await setup();
    expect(screen.getByRole('button', { name: 'Choose dashboard, current Reading' })).toBeTruthy();
  });

  it('renders every tile as a square glance in a two-column grid', async () => {
    await setup();
    const grid = screen.getAllByTestId('dashboard-grid')[0] as HTMLElement;
    expect(grid.getAttribute('style')).toContain('flex-wrap');
    // Overview: todos show counts, the habit a 7-day row, no inline todo list any more.
    const todos = screen.getAllByTestId(/^square-.*\.todos\.md$/)[0] as HTMLElement;
    expect(within(todos).getByTestId('tile-counts')).toBeTruthy();
    const habit = within(grid).getByTestId('square-.kh/health.habit.csv');
    expect(within(habit).getByTestId('viz-days')).toBeTruthy();
    expect(screen.queryByTestId('tile-todos')).toBeNull();
  });

  it('has no shortcut row on page 1', async () => {
    await setup();
    expect(screen.queryByTestId('nav-/quick-todo')).toBeNull();
  });

  it('runs a one-tap quick action and writes the file', async () => {
    const onWrite = vi.fn();
    await setup({ onWrite });
    const habit = screen.getByTestId('square-.kh/health.habit.csv');
    fireEvent.click(within(habit).getByTestId('tile-quick-action'));
    expect(onWrite).toHaveBeenCalledWith('.kh/health.habit.csv', expect.any(String));
  });

  it('offers Open file for kinds the app has no tile for', async () => {
    const pages = await demoPages();
    const first = pages[0] as DashboardPage;
    const withUnknown = [
      { ...first, files: [...first.files, { path: 'notes/x.drawio', content: '<x/>' }] },
      ...pages.slice(1),
    ];
    const onNavigate = vi.fn();
    render(
      <DashboardPager pages={withUnknown} now={NOW} onWrite={vi.fn()} onNavigate={onNavigate} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Open file x\.drawio/ }));
    expect(onNavigate).toHaveBeenCalledWith('/files/notes/x.drawio');
  });

  it('tapping a tile opens its deep dive', async () => {
    const { onNavigate } = await setup();
    fireEvent.click(screen.getByRole('button', { name: /^Health,/ }));
    expect(onNavigate).toHaveBeenCalledWith(
      `/dashboard/tile?path=${encodeURIComponent('.kh/health.habit.csv')}`,
    );
  });
});

describe('DashboardPager states', () => {
  it('hides dots and the menu for a single page', () => {
    render(
      <DashboardPager
        pages={[{ id: 'today', name: 'Today', files: [] }]}
        defaulted
        now={NOW}
        onWrite={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('dashboard-dots')).toBeNull();
    expect(screen.queryByTestId('dashboard-title')).toBeNull();
  });

  it('explains dashboards on the defaulted page', async () => {
    const [first] = await demoPages();
    render(
      <DashboardPager
        pages={[{ id: 'today', name: 'Today', files: (first as DashboardPage).files }]}
        defaulted
        now={NOW}
        onWrite={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Group tiles into dashboards in the web console; they show up here as pages.',
      ),
    ).toBeTruthy();
  });

  it('shows an empty state for a configured dashboard without tiles', () => {
    render(
      <DashboardPager
        pages={[
          { id: 'a', name: 'Alpha', files: [] },
          { id: 'b', name: 'Beta', files: [] },
        ]}
        now={NOW}
        onWrite={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getAllByText('No tiles on this dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Add files to Alpha in the web console.').length).toBe(1);
  });
});

describe('DashboardPager with a tile that throws', () => {
  it('shows that tile as an inline error and keeps the others', async () => {
    const real = controllers.presentTile;
    const pages = await demoPages();
    const [bad, good] = pages[0]?.files ?? [];
    vi.spyOn(controllers, 'presentTile').mockImplementation((path, content, now) => {
      if (path === bad?.path) throw new Error('parser blew up');
      return real(path, content, now);
    });
    render(<DashboardPager pages={pages} now={NOW} onWrite={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('parser blew up')).toBeTruthy();
    expect(screen.getByText("Couldn't show this tile")).toBeTruthy();
    expect(good).toBeDefined();
    expect(screen.getAllByTestId(/^(tile|summary)-/).length).toBeGreaterThan(0);
  });
});

describe('DashboardPager RSS tile', () => {
  it('fetches the feeds and shows the unread count once they arrive', async () => {
    const pages = (await demoPages()).filter((p) =>
      p.files.some((f) => f.path.endsWith('.rss.json')),
    );
    render(<DashboardPager pages={pages} now={NOW} onWrite={vi.fn()} onNavigate={vi.fn()} />);
    expect(feeds.ensure).toHaveBeenCalledWith(
      expect.arrayContaining(['https://hnrss.org/frontpage']),
    );
    const item = (guid: string) => ({ title: `Item ${guid}`, link: `https://h/${guid}`, guid });
    feeds.set({
      'https://hnrss.org/frontpage': {
        title: 'HN',
        fetchedAt: 1,
        loading: false,
        items: [item('a'), item('b')],
      },
    });
    const tile = await screen.findByTestId(/^square-.*\.rss\.json$/);
    expect(await within(tile).findByText('2')).toBeTruthy();
    expect(within(tile).getByText('unread')).toBeTruthy();
    // The glance is a count and a few figures; item titles live in the detail view.
    expect(within(tile).queryByText('Item a')).toBeNull();
  });
});
