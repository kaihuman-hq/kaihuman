import { describe, expect, it } from 'vitest';
import {
  addRssFeedUrl,
  addTravelTrip,
  boardOverviewView,
  type FeedSnapshot,
  markRssRead,
  paletteSettingsView,
  removeRssFeedById,
  rssView,
  travelView,
} from './more-tiles.js';
import { presentTile } from './tile-controllers.js';

const NOW = new Date(2026, 10, 8, 12, 0, 0);
const feedsFile = JSON.stringify({
  feedOptions: [
    { id: 'f1', url: 'https://a.test/feed', read: ['g1'] },
    { id: 'f2', url: 'https://b.test/rss', read: [] },
  ],
  readLater: [],
});
const snapshot: FeedSnapshot = {
  'https://a.test/feed': {
    title: 'Alpha',
    fetchedAt: 1,
    loading: false,
    items: [
      { title: 'One', link: 'https://a.test/1', guid: 'g1', pubDate: '2026-11-01T00:00:00Z' },
      { title: 'Two', link: 'https://a.test/2', guid: 'g2', pubDate: '2026-11-05T00:00:00Z' },
    ],
  },
  'https://b.test/rss': { items: [], fetchedAt: 1, loading: false, error: 'HTTP 500' },
};

describe('rss', () => {
  it('builds rows newest first with unread counts and statuses', () => {
    const v = rssView(feedsFile, snapshot, NOW);
    expect(v.items.map((i) => i.title)).toEqual(['Two', 'One']);
    expect(v.items[1]).toMatchObject({ unread: false, source: 'Alpha', feedId: 'f1', key: 'g1' });
    expect(v.unreadCount).toBe(1);
    expect(v.feeds[0]).toMatchObject({ title: 'Alpha', unread: 1, total: 2, status: 'idle' });
    expect(v.feeds[1]).toMatchObject({ title: 'b.test', status: 'error', error: 'HTTP 500' });
  });
  it('caps items at 50 and tolerates missing snapshots', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      title: `t${i}`,
      link: `https://a.test/${i}`,
      guid: `g${i}`,
    }));
    const v = rssView(
      feedsFile,
      { 'https://a.test/feed': { items, fetchedAt: 0, loading: true } },
      NOW,
    );
    expect(v.items).toHaveLength(50);
    expect(v.feeds[0]?.status).toBe('loading');
    expect(rssView('', {}, NOW)).toEqual({ feeds: [], items: [], unreadCount: 0 });
  });
  it('marks read, adds and removes feeds', () => {
    expect(JSON.parse(markRssRead(feedsFile, 'f2', 'x')).feedOptions[1].read).toEqual(['x']);
    const added = addRssFeedUrl(feedsFile, 'https://c.test/atom', 'f3');
    expect(added.ok && JSON.parse(added.content).feedOptions[2]).toMatchObject({ id: 'f3' });
    expect(addRssFeedUrl(feedsFile, 'ftp://x', 'f4')).toEqual({
      ok: false,
      error: 'Enter an http(s) URL',
    });
    expect(addRssFeedUrl(feedsFile, 'https://a.test/feed', 'f4').ok).toBe(false);
    expect(JSON.parse(removeRssFeedById(feedsFile, 'f1')).feedOptions).toHaveLength(1);
  });
});

const travelFile = JSON.stringify({
  version: 1,
  currency: 'EUR',
  trips: [
    { id: 'old', title: 'Old', start: '2026-10-01', end: '2026-10-03', custom: [], steps: [] },
    {
      id: 'now',
      title: 'Now',
      start: '2026-11-07',
      end: '2026-11-09',
      custom: [],
      steps: [{ id: 's', type: 'hotel', custom: [], from: '', to: '', ref: '', cost: 120.5 }],
    },
    { id: 'soon', title: 'Soon', start: '2026-11-20', custom: [], steps: [] },
    { id: 'undated', title: 'Idea', custom: [], steps: [] },
  ],
});

describe('travel', () => {
  it('summarises trips with status, cost and next trip', () => {
    const v = travelView(travelFile, NOW);
    expect(v.trips.map((t) => [t.id, t.status])).toEqual([
      ['old', 'past'],
      ['now', 'current'],
      ['soon', 'upcoming'],
      ['undated', 'upcoming'],
    ]);
    expect(v.trips[1]).toMatchObject({
      cost: 120.5,
      costLabel: '120.50 EUR',
      steps: 1,
      dateRange: '2026-11-07 – 2026-11-09',
    });
    expect(v.trips[3]?.dateRange).toBe('No dates');
    expect(v.totalLabel).toBe('120.50 EUR');
    expect(v.next).toEqual({ name: 'Now', daysUntil: 0 });
  });
  it('counts days until an upcoming trip', () => {
    const only = JSON.stringify({
      version: 1,
      currency: 'USD',
      trips: [{ id: 'a', title: 'A', start: '2026-11-20', custom: [], steps: [] }],
    });
    expect(travelView(only, NOW).next).toEqual({ name: 'A', daysUntil: 12 });
    expect(travelView('', NOW).next).toBeNull();
  });
  it('adds a trip and validates the draft', () => {
    const r = addTravelTrip('', { name: ' Rome ', start: '2026-12-01', end: '' }, 't1');
    expect(r.ok && JSON.parse(r.content).trips[0]).toMatchObject({
      id: 't1',
      title: 'Rome',
      start: '2026-12-01',
    });
    expect(addTravelTrip('', { name: '', start: '', end: '' }, 't').ok).toBe(false);
    expect(addTravelTrip('', { name: 'x', start: '12/01', end: '' }, 't').ok).toBe(false);
    expect(addTravelTrip('', { name: 'x', start: '2026-12-02', end: '2026-12-01' }, 't').ok).toBe(
      false,
    );
  });
});

describe('board overview', () => {
  const day = 86_400_000;
  const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * day).toISOString();
  const todos = (rows: string[]) => `# T\n\n${rows.join('\n')}\n`;
  it('counts columns per config and flags overdue in-progress items', () => {
    const files = [
      { path: 'a.todos.md', content: todos(['- [ ] one', '- [>] two', '- [x] three']) },
      { path: '.kh/business/clients/c/todos.todos.md', content: todos(['- [>] biz']) },
    ];
    const v = boardOverviewView('{}', files, NOW);
    expect(v.columns.map((c) => c.status)).toEqual(['backlog', 'in-progress']);
    expect(v.files).toBe(2);
    expect(v.columns[0]?.count).toBe(1);
    expect(v.columns[1]?.count).toBe(2);
    expect(v.overdueCount).toBe(2);
    const biz = boardOverviewView('{"scope":"business","showDone":true}', files, NOW);
    expect(biz.files).toBe(1);
    expect(biz.columns.find((c) => c.status === 'done')?.count).toBe(0);
    const personal = boardOverviewView('{"scope":"personal","showDone":true}', files, NOW);
    expect(personal.columns.find((c) => c.status === 'done')?.count).toBe(1);
    expect(boardOverviewView('{"showOverdue":false}', files, NOW).overdueCount).toBe(0);
  });
  it('returns an empty overview without files', () => {
    expect(boardOverviewView('', [], NOW)).toMatchObject({ overdueCount: 0, files: 0 });
    void iso;
  });
});

describe('palette settings', () => {
  it('lists defaults without problems', () => {
    const v = paletteSettingsView('');
    expect(v.engines.length).toBeGreaterThan(0);
    expect(v.tools[0]).toMatchObject({ prefix: 'l', enabled: true, problem: null });
    expect(v.problems).toEqual([]);
  });
  it('reports problems and invalid JSON', () => {
    const v = paletteSettingsView(
      JSON.stringify({
        searchEngines: [{ name: 'Bad', url: 'nope' }],
        assistants: [],
        tools: [{ prefix: 'b', name: 'T', url: 'https://x.test' }],
      }),
    );
    expect(v.engines[0]).toMatchObject({ enabled: false });
    expect(v.tools[0]?.enabled).toBe(false);
    expect(v.problems).toHaveLength(2);
    expect(paletteSettingsView('{x').problems[0]).toMatch(/not valid JSON/);
  });
});

describe('presentTile', () => {
  it('dispatches the new kinds', () => {
    expect(presentTile('x.rss.json', '', NOW)?.kind).toBe('rss');
    expect(presentTile('x.travel.json', '', NOW)?.kind).toBe('travel');
    expect(presentTile('x.board-overview.json', '', NOW)?.kind).toBe('boardoverview');
    expect(presentTile('.kh/command-palette.settings.json', '', NOW)?.kind).toBe('palettesettings');
  });
});
