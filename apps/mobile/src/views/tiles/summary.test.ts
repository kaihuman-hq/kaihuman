import { buildDemoSeed } from '@kaihuman/core';
import { describe, expect, it } from 'vitest';
import {
  presentTile,
  type TileKind,
  tileKindForPath,
} from '../../components/widgets/tile-controllers.js';
import { summarizeTile, TILE_SIZE } from './summary.js';

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const seed = buildDemoSeed(NOW).files;
const summary = (suffix: string) => {
  const path = Object.keys(seed).find((p) => p.endsWith(suffix)) as string;
  const tile = presentTile(path, seed[path] as string, NOW);
  if (!tile) throw new Error(suffix);
  return summarizeTile(tile, NOW);
};

describe('TILE_SIZE', () => {
  it('classifies every kind the demo seed has', () => {
    const kinds = new Set(Object.keys(seed).flatMap((p) => tileKindForPath(p) ?? []) as TileKind[]);
    for (const k of kinds) expect(TILE_SIZE[k]).toBeTruthy();
    expect(TILE_SIZE.todos).toBe('full');
    expect(TILE_SIZE.habit).toBe('compact');
    expect(TILE_SIZE.events).toBe('medium');
  });
});

describe('summarizeTile', () => {
  const suffixes = [
    '.todos.md',
    '.habit.csv',
    '.timetracking.csv',
    '.events.csv',
    '.actionlog.md',
    '.timezones.json',
    '.readitlater.json',
    '.bookmarks.json',
    '.budget.csv',
    '.stocks.csv',
    '.consumption.csv',
    '.data-collection.csv',
  ];
  it.each(suffixes)('gives %s a stat and at most three items', (suffix) => {
    const s = summary(suffix);
    expect(s.stat).toBeTruthy();
    expect(s.statLabel).toBeTruthy();
    expect(s.items.length).toBeLessThanOrEqual(3);
  });

  it('habit: streak with the latest days first', () => {
    const s = summary('.habit.csv');
    expect(s.statLabel).toBe('day streak');
    expect(Number(s.stat)).toBeGreaterThanOrEqual(0);
    expect(s.items[0]).toMatch(/^Today: (done|missed)$/);
  });

  it('timer: idle or elapsed', () => {
    const s = summary('.timetracking.csv');
    expect(s.stat === 'Idle' || /^\d+:\d{2}:\d{2}$/.test(s.stat)).toBe(true);
    expect(s.items[0]).toMatch(/^Today: /);
  });

  it('events, readitlater, bookmarks: count and titles', () => {
    expect(summary('.events.csv').items.length).toBeGreaterThan(0);
    const later = summary('.readitlater.json');
    expect(later.statLabel).toBe('unread');
    expect(later.items.length).toBeGreaterThan(0);
    expect(summary('.bookmarks.json').items.length).toBe(3);
  });

  it('budget: net with income and spending', () => {
    const s = summary('.budget.csv');
    expect(s.items[0]).toMatch(/^Income /);
    expect(s.items[1]).toMatch(/^Spent /);
  });

  it('stocks: total value and profit', () => {
    const s = summary('.stocks.csv');
    expect(s.statLabel).toBe('total value');
    expect(s.items[0]).toMatch(/^[+-][\d,]+ \(-?[\d.]+%\)$/);
  });

  it('timezones: city and time', () => {
    const s = summary('.timezones.json');
    expect(s.stat).toMatch(/^\d{2}:\d{2}$/);
    expect(s.items[0]).toMatch(/ \d{2}:\d{2}$/);
  });

  it('datacollection: rows', () => {
    expect(summary('.data-collection.csv').statLabel).toBe('rows');
  });

  it('prompts and commands: counts and names', () => {
    for (const [content, path, label] of [
      ['## Greeting\nhello {{name}}\n', 'a.prompts.md', 'prompt'],
      ['', 'a.commands.md', 'command'],
    ] as const) {
      const tile = presentTile(path, content, NOW);
      if (!tile) throw new Error(path);
      const s = summarizeTile(tile, NOW);
      expect(s.statLabel).toMatch(new RegExp(`^${label}s?$`));
      expect(s.items.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('summaries of the file-kind tiles', () => {
  it('sizes the four newer kinds', () => {
    expect(TILE_SIZE.rss).toBe('medium');
    expect(TILE_SIZE.travel).toBe('medium');
    expect(TILE_SIZE.boardoverview).toBe('medium');
    expect(TILE_SIZE.palettesettings).toBe('compact');
  });

  it('rss: unread count with the unread titles', () => {
    const s = summarizeTile(
      {
        kind: 'rss',
        view: {
          feeds: [],
          unreadCount: 2,
          items: [
            { feedId: 'f', key: 'a', title: 'A', link: '', source: 's', date: null, unread: true },
            { feedId: 'f', key: 'b', title: 'B', link: '', source: 's', date: null, unread: false },
            { feedId: 'f', key: 'c', title: 'C', link: '', source: 's', date: null, unread: true },
          ],
        },
      },
      NOW,
    );
    expect(s).toEqual({ stat: '2', statLabel: 'unread', items: ['A', 'C'] });
  });

  it('travel: days to the next trip, else the trip count', () => {
    const trip = {
      id: 't',
      name: 'Rome',
      dateRange: '2026-11-20 – 2026-11-25',
      cost: 0,
      costLabel: '0.00 EUR',
      steps: 0,
      status: 'upcoming' as const,
    };
    const view = { currency: 'EUR', totalLabel: '0.00 EUR', trips: [trip] };
    expect(
      summarizeTile(
        { kind: 'travel', view: { ...view, next: { name: 'Rome', daysUntil: 1 } } },
        NOW,
      ),
    ).toMatchObject({ stat: '1', statLabel: 'day to Rome' });
    expect(summarizeTile({ kind: 'travel', view: { ...view, next: null } }, NOW)).toMatchObject({
      stat: '1',
      statLabel: 'trip',
    });
  });

  it('board overview: open count and column lines', () => {
    const col = (status: 'backlog' | 'done', count: number) => ({
      status,
      label: status === 'done' ? 'Done' : 'Backlog',
      count,
      items: [],
    });
    const s = summarizeTile(
      {
        kind: 'boardoverview',
        view: { columns: [col('backlog', 3), col('done', 9)], overdueCount: 1, files: 2 },
      },
      NOW,
    );
    expect(s.stat).toBe('3');
    expect(s.items).toEqual(['1 overdue', 'Backlog: 3', 'Done: 9']);
  });

  it('palette settings: enabled count, problems first', () => {
    const e = { prefix: 'g', name: 'G', detail: '', enabled: true, problem: null };
    const s = summarizeTile(
      {
        kind: 'palettesettings',
        view: {
          engines: [e, { ...e, enabled: false }],
          assistants: [],
          tools: [],
          problems: ['Bad'],
        },
      },
      NOW,
    );
    expect(s).toEqual({ stat: '1', statLabel: 'enabled', items: ['Bad'] });
  });
});
