import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { openBrowserAsync } from 'expo-web-browser';
import { Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BoardOverviewView,
  FeedSnapshot,
  PaletteSettingsView,
  TravelView,
} from '../../components/widgets/tile-controllers.js';
import { markRssRead, rssView, travelView } from '../../components/widgets/tile-controllers.js';
import type { ContentFiles } from '../../screens/file-editor-screen.js';
import type { Ctx } from './bodies.js';
import { BoardOverview, PaletteSettings, Rss, relativeDate, Travel } from './more-bodies.js';

const store = vi.hoisted(() => {
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
vi.mock('../../files/feed-store.js', () => ({ feedStore: store }));

afterEach(() => {
  cleanup();
  store.set({});
  vi.clearAllMocks();
});

const NOW = new Date(2026, 10, 8, 12, 0, 0);
const ctx = (content: string, apply: Ctx['apply'] = vi.fn(() => true)): Ctx => ({
  content,
  now: NOW,
  apply,
  error: null,
});

const feedsFile = JSON.stringify({
  feedOptions: [{ id: 'f1', url: 'https://a.test/feed', read: ['g1'] }],
  readLater: [],
});
const snapshot: FeedSnapshot = {
  'https://a.test/feed': {
    title: 'Alpha',
    fetchedAt: 1,
    loading: false,
    items: [
      { title: 'Read one', link: 'https://a.test/1', guid: 'g1', pubDate: '2026-11-01T00:00:00Z' },
      {
        title: 'Fresh two',
        link: 'https://a.test/2',
        guid: 'g2',
        pubDate: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(),
      },
    ],
  },
};

describe('relativeDate', () => {
  it('shortens recent dates and keeps old ones as a date', () => {
    expect(relativeDate(null, NOW)).toBe('');
    expect(relativeDate(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5m ago');
    expect(relativeDate(new Date(NOW.getTime() - 2 * 86_400_000).toISOString(), NOW)).toBe(
      '2d ago',
    );
    expect(relativeDate('2025-01-02T00:00:00Z', NOW)).toBe('2025-01-02');
  });
});

describe('Rss', () => {
  it('fetches its feeds on mount and shows items once they arrive', async () => {
    render(<Rss view={rssView(feedsFile, {}, NOW)} ctx={ctx(feedsFile)} />);
    expect(store.ensure).toHaveBeenCalledWith(['https://a.test/feed']);
    expect(screen.getByText('No items to show.')).toBeTruthy();
    store.set(snapshot);
    expect(await screen.findByText('Fresh two')).toBeTruthy();
    expect(screen.getByText('Alpha · 3h ago')).toBeTruthy();
    expect(screen.getByText('1 unread in 1 feed')).toBeTruthy();
  });

  it('opens an item in the in-app browser and marks it read', async () => {
    store.set(snapshot);
    const apply = vi.fn(() => true);
    render(<Rss view={rssView(feedsFile, snapshot, NOW)} ctx={ctx(feedsFile, apply)} />);
    fireEvent.click(await screen.findByRole('link', { name: 'Fresh two' }));
    expect(openBrowserAsync).toHaveBeenCalledWith('https://a.test/2');
    const written = (apply.mock.calls[0] as unknown as [string])[0];
    expect(JSON.parse(written).feedOptions[0].read).toContain('g2');
  });

  it('defaults to Unread and the All toggle brings read items back', async () => {
    store.set(snapshot);
    render(<Rss view={rssView(feedsFile, snapshot, NOW)} ctx={ctx(feedsFile)} />);
    expect(await screen.findByText('Fresh two')).toBeTruthy();
    expect(screen.queryByText('Read one')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Read one')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.queryByText('Read one')).toBeNull();
  });

  it('says so when every item is read', () => {
    const allRead = JSON.stringify({
      feedOptions: [{ id: 'f1', url: 'https://a.test/feed', read: ['g1', 'g2'] }],
      readLater: [],
    });
    store.set(snapshot);
    render(<Rss view={rssView(allRead, snapshot, NOW)} ctx={ctx(allRead)} />);
    expect(screen.getByText('No unread items.')).toBeTruthy();
  });

  describe('swipe to mark read', () => {
    const realOS = Platform.OS;
    afterEach(() => {
      (Platform as { OS: string }).OS = realOS;
    });

    it('persists through the same write as opening, for unread items only', () => {
      (Platform as { OS: string }).OS = 'ios';
      store.set(snapshot);
      const apply = vi.fn(() => true);
      render(<Rss view={rssView(feedsFile, snapshot, NOW)} ctx={ctx(feedsFile, apply)} />);
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      expect(screen.getAllByTestId('swipe-action-Mark read')).toHaveLength(1);
      fireEvent.click(screen.getByTestId('swipe-action-Mark read'));
      expect(openBrowserAsync).not.toHaveBeenCalled();
      expect(apply).toHaveBeenCalledWith(markRssRead(feedsFile, 'f1', 'g2'));
    });
  });

  it('shows loading and per-feed errors', () => {
    store.set({
      'https://a.test/feed': { items: [], fetchedAt: 0, loading: false, error: 'HTTP 500' },
    });
    render(<Rss view={rssView(feedsFile, {}, NOW)} ctx={ctx(feedsFile)} />);
    expect(screen.getByRole('alert').textContent).toContain('HTTP 500');
    cleanup();
    store.set({ 'https://a.test/feed': { items: [], fetchedAt: 0, loading: true } });
    render(<Rss view={rssView(feedsFile, {}, NOW)} ctx={ctx(feedsFile)} />);
    expect(screen.getByRole('progressbar', { name: 'Loading feeds' })).toBeTruthy();
  });

  it('adds a feed by url with a fresh id and rejects a bad one', () => {
    const apply = vi.fn((r: unknown) => typeof r === 'string' || (r as { ok: boolean }).ok);
    render(<Rss view={rssView('', {}, NOW)} ctx={ctx('', apply)} />);
    const field = screen.getByLabelText('Feed URL');
    fireEvent.change(field, { target: { value: 'https://new.test/rss' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add feed' }));
    const result = (apply.mock.calls[0] as unknown as [{ ok: boolean; content: string }])[0];
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.content).feedOptions[0]).toMatchObject({
      url: 'https://new.test/rss',
    });
  });
});

describe('Travel', () => {
  const file = JSON.stringify({
    version: 1,
    currency: 'EUR',
    trips: [
      { id: 'soon', title: 'Rome', start: '2026-11-20', end: '2026-11-25', custom: [], steps: [] },
    ],
  });
  it('shows the next-trip banner and trip rows', () => {
    render(<Travel view={travelView(file, NOW)} ctx={ctx(file)} />);
    expect(screen.getByLabelText('Next trip, Rome, 12 days')).toBeTruthy();
    expect(screen.getByText('In 12 days')).toBeTruthy();
    expect(screen.getByTestId('trip-soon')).toBeTruthy();
    expect(screen.getByText('upcoming')).toBeTruthy();
  });

  it('adds a trip from the form', () => {
    const apply = vi.fn(() => true);
    render(<Travel view={travelView('', NOW)} ctx={ctx('', apply)} />);
    expect(screen.getByText('No trips planned.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add trip' }));
    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Oslo' } });
    fireEvent.change(screen.getByLabelText('Start (YYYY-MM-DD)'), {
      target: { value: '2026-12-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));
    const result = (apply.mock.calls[0] as unknown as [{ content: string }])[0];
    expect(JSON.parse(result.content).trips[0]).toMatchObject({
      title: 'Oslo',
      start: '2026-12-01',
    });
  });

  it('renders a view built by hand', () => {
    const view: TravelView = { currency: 'USD', totalLabel: '0.00 USD', next: null, trips: [] };
    render(<Travel view={view} ctx={ctx('')} />);
    expect(screen.queryByText('Next trip')).toBeNull();
  });
});

describe('BoardOverview', () => {
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

  it('loads .todos.md files and shows columns with counts and first items', async () => {
    const todo = '# T\n\n- [ ] Write tests\n- [>] Doing it\n';
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
    const todo = '# T\n\n- [>] Stuck item\n';
    render(<BoardOverview view={view} ctx={ctx('')} files={files({ 'a.todos.md': todo })} />);
    expect(await screen.findByText('1 overdue')).toBeTruthy();
  });
});

describe('PaletteSettings', () => {
  const entry = {
    prefix: 'g',
    name: 'Google',
    detail: 'https://g.test',
    enabled: true,
    problem: null,
  };
  it('lists sections and shows problems in the danger tone', () => {
    const view: PaletteSettingsView = {
      engines: [entry],
      assistants: [],
      tools: [{ ...entry, prefix: 'b', name: 'Broken', enabled: false, problem: 'Missing url' }],
      problems: ['Tool "Broken" is invalid'],
    };
    render(<PaletteSettings view={view} />);
    expect(screen.getByText('Search engines')).toBeTruthy();
    expect(screen.queryByText('Assistants')).toBeNull();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Tool "Broken" is invalid');
    expect(screen.getByText('Missing url')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
  });
  it('says so when nothing is configured', () => {
    render(<PaletteSettings view={{ engines: [], assistants: [], tools: [], problems: [] }} />);
    expect(screen.getByText('Nothing configured.')).toBeTruthy();
  });
});
