import { buildDemoSeed, configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DashboardPage, loadDashboards } from '../screens/dashboards.js';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { DashboardPager } from './dashboard-pager.js';

afterEach(cleanup);
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

  it('renders compact tiles as summaries and todos in full', async () => {
    await setup();
    // Overview: todos (full), timer + habit (compact), events + actionlog (medium).
    expect(screen.getByTestId('tile-todos')).toBeTruthy();
    expect(screen.getByTestId('summary-habit')).toBeTruthy();
    expect(screen.queryByTestId('tile-habit')).toBeNull();
    expect(screen.getByTestId('summary-events')).toBeTruthy();
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

  it('See all opens the tile route', async () => {
    const { onNavigate } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'See all Habit' }));
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
