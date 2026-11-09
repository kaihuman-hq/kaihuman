import { buildDemoSeed } from '@kaihuman/core';
import { describe, expect, it } from 'vitest';
import {
  actionLogView,
  addBookmarkEntry,
  addCommandEntry,
  addEvent,
  addPromptEntry,
  addReadLaterUrl,
  addTodoTask,
  bookmarksView,
  budgetView,
  clearReadLater,
  clockIn,
  clockOut,
  commandsView,
  consumptionView,
  dataCollectionView,
  deleteBookmarkEntry,
  eventsView,
  formatElapsed,
  formatOffset,
  habitView,
  interpolateTemplate,
  logAction,
  markReadLaterRead,
  missingParameters,
  presentTile,
  promptsView,
  readLaterView,
  stocksView,
  TILE_EXTENSIONS,
  tileKindForPath,
  timerView,
  todosView,
  toggleHabitToday,
  toggleTodo,
  worldClocksView,
  zoneOffsetMinutes,
} from './tile-controllers.js';

const now = new Date(2026, 10, 5, 10, 0, 0); // local, like the seed's own dates
const seed = buildDemoSeed(now).files;
const demo = (suffix: string): { path: string; content: string } => {
  const path = Object.keys(seed).find((p) => p.endsWith(suffix));
  if (!path) throw new Error(`no demo file for ${suffix}`);
  return { path, content: seed[path] as string };
};

describe('dispatch', () => {
  it('maps every dashboard extension to a tile and presents each demo file', () => {
    expect(TILE_EXTENSIONS).toHaveLength(18);
    for (const ext of TILE_EXTENSIONS) {
      expect(tileKindForPath(`.kh/x${ext}`)).toBeDefined();
    }
    expect(tileKindForPath('notes.md')).toBeUndefined();
    expect(presentTile('notes.md', '', now)).toBeUndefined();
    for (const ext of TILE_EXTENSIONS) {
      const file = Object.keys(seed).find((p) => p.endsWith(ext));
      if (!file) continue;
      expect(presentTile(file, seed[file] as string, now)?.kind).toBe(tileKindForPath(file));
    }
  });
});

describe('.todos.md', () => {
  const { content } = demo('projects.todos.md');

  it('lists visible todos with milestone names and the next milestone', () => {
    const view = todosView(content, now);
    expect(view.rows.length).toBeGreaterThan(0);
    expect(view.openCount).toBeGreaterThan(0);
    expect(view.upcomingMilestone?.id).toBe('v1');
  });

  it('toggles a todo done and back, and hides it an hour after it was done', () => {
    const index = todosView(content, now).rows.find((r) => r.status === 'backlog')?.index ?? -1;
    const done = toggleTodo(content, index, now);
    expect(todosView(done, now).rows.find((r) => r.index === index)?.status).toBe('done');
    const later = new Date(now.getTime() + 2 * 3_600_000);
    expect(todosView(done, later).rows.some((r) => r.index === index)).toBe(false);
    expect(
      todosView(toggleTodo(done, index, now), now).rows.find((r) => r.index === index)?.status,
    ).toBe('backlog');
    expect(toggleTodo(content, 9999, now)).toBe(content);
  });

  it('adds a task and rejects blank input', () => {
    const res = addTodoTask(content, '  Buy milk  ', now, ['home']);
    expect(
      res.ok &&
        todosView(res.content, now).rows.some(
          (r) => r.text === 'Buy milk' && r.tags.includes('home'),
        ),
    ).toBe(true);
    expect(addTodoTask(content, '   ', now).ok).toBe(false);
  });
});

describe('.habit.csv', () => {
  const { content } = demo('.habit.csv');

  it('computes streaks and a seven-day strip ending today', () => {
    const view = habitView(content, now);
    expect(view.strip).toHaveLength(7);
    expect(view.strip[6]).toMatchObject({ date: '2026-11-05', isToday: true });
    expect(view.strip[0]?.date).toBe('2026-10-30');
    expect(view.totalCount).toBeGreaterThan(0);
  });

  it('toggles today on and off', () => {
    const base = 'iso date;goal reached\n2026-11-03;x\n2026-11-04;x';
    expect(habitView(base, now)).toMatchObject({ currentStreak: 2, checkedInToday: false });
    const on = toggleHabitToday(base, now);
    expect(habitView(on, now)).toMatchObject({ currentStreak: 3, checkedInToday: true });
    const off = toggleHabitToday(on, now);
    expect(habitView(off, now).checkedInToday).toBe(false);
  });
});

describe('.timetracking.csv', () => {
  const { content } = demo('.timetracking.csv');

  it('detects the demo timer already running today', () => {
    const view = timerView(content, now);
    expect(view.state).toBe('running');
    if (view.state === 'running') expect(view.elapsedSeconds).toBeGreaterThanOrEqual(0);
  });

  it('clocks out, in again, and ignores redundant taps', () => {
    const stopped = clockOut(content, now);
    expect(timerView(stopped, now).state).toBe('idle');
    expect(clockOut(stopped, now)).toBe(stopped);
    const base = 'iso date;time\n2026-11-04;08:00,12:00';
    expect(timerView(base, now)).toEqual({ state: 'idle', todayMinutes: 0 });
    const running = clockIn(base, now);
    expect(timerView(running, new Date(2026, 10, 5, 11, 30, 15))).toEqual({
      state: 'running',
      since: '10:00',
      elapsedSeconds: 5415,
      todayMinutes: 90,
    });
    expect(clockIn(running, now)).toBe(running);
    const done = clockOut(running, new Date(2026, 10, 5, 12, 0));
    expect(timerView(done, new Date(2026, 10, 5, 13, 0))).toEqual({
      state: 'idle',
      todayMinutes: 120,
    });
  });

  it('formats elapsed seconds', () => {
    expect(formatElapsed(3725)).toBe('1:02:05');
  });
});

describe('.events.csv', () => {
  const { content } = demo('.events.csv');

  it('counts down to events and birthdays', () => {
    const rows = eventsView(content, now);
    expect(rows[0]).toMatchObject({
      name: 'Team Offsite',
      kind: 'event',
      daysUntil: 4,
      label: 'IN 4 DAYS',
    });
    const mum = eventsView(content, now, 20).find((r) => r.name === 'Mum');
    expect(mum).toMatchObject({ kind: 'birthday', daysUntil: 16, turns: 64 });
  });

  it('adds an event and validates input', () => {
    const res = addEvent(content, { name: 'Gig', startDate: '2026-11-06' });
    expect(res.ok && eventsView(res.content, now)[0]).toMatchObject({
      name: 'Gig',
      daysUntil: 1,
      label: 'TOMORROW',
    });
    expect(addEvent(content, { name: '', startDate: '2026-11-06' }).ok).toBe(false);
    expect(addEvent(content, { name: 'x', startDate: '06.11.2026' }).ok).toBe(false);
    expect(
      addEvent(content, { name: 'x', startDate: '2026-11-06', endDate: '2026-11-01' }).ok,
    ).toBe(false);
  });
});

describe('.actionlog.md', () => {
  const { content } = demo('.actionlog.md');

  it('shows the newest entries and filters by tag', () => {
    const view = actionLogView(content, 3);
    expect(view.entries).toHaveLength(3);
    expect(view.entries[0]?.description).toContain('Shipped the analytics dashboard');
    expect(view.tags).toContain('health');
    expect(
      actionLogView(content, 50, 'health').entries.every((e) => e.tags.includes('health')),
    ).toBe(true);
  });

  it('appends an entry with inline and extra tags', () => {
    const res = logAction(content, 'Ran tests #dev', now, ['work']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const top = actionLogView(res.content, 1).entries[0];
    expect(top?.description).toContain('Ran tests');
    expect(top?.tags).toEqual(expect.arrayContaining(['dev', 'work']));
    expect(top?.timestamp).toBe('2026-11-05 10:00:00');
    expect(logAction(content, ' ', now).ok).toBe(false);
  });
});

describe('.timezones.json', () => {
  const { content } = demo('.timezones.json');

  it('computes live offsets, DST included', () => {
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-11-05T12:00:00Z'))).toBe(60);
    expect(zoneOffsetMinutes('Europe/Berlin', new Date('2026-07-05T12:00:00Z'))).toBe(120);
    expect(formatOffset(-330)).toBe('-05:30');
  });

  it('renders a clock per zone', () => {
    const clocks = worldClocksView(content, new Date('2026-11-05T12:00:00Z'));
    const berlin = clocks.find((c) => c.name === 'Europe/Berlin');
    expect(berlin).toMatchObject({ time: '13:00', offset: '+01:00', offsetMinutes: 60 });
    expect(clocks.length).toBeGreaterThan(1);
  });

  it('skips unknown zones', () => {
    const json = JSON.stringify({
      timezones: [{ id: 'a', name: 'Mars/Olympus', offset: '+00:00', cities: [] }],
    });
    expect(worldClocksView(json, now)).toEqual([]);
  });
});

describe('.readitlater.json', () => {
  const { content } = demo('.readitlater.json');

  it('splits unread and read, marks read, clears', () => {
    const view = readLaterView(content);
    expect(view.unread.length).toBeGreaterThan(0);
    const id = view.unread[0]?.id ?? '';
    const marked = markReadLaterRead(content, id, now);
    expect(marked.ok && readLaterView(marked.content).read.some((i) => i.id === id)).toBe(true);
    expect(markReadLaterRead(content, 'nope', now).ok).toBe(false);
    if (!marked.ok) return;
    expect(readLaterView(clearReadLater(marked.content)).read).toEqual([]);
    expect(readLaterView(clearReadLater(marked.content)).unread.length).toBe(
      view.unread.length - 1,
    );
    expect(readLaterView(clearReadLater(content, true))).toEqual({ unread: [], read: [] });
  });

  it('adds a url once and rejects non-http', () => {
    const res = addReadLaterUrl(content, 'https://example.com/a', now);
    expect(res.ok && readLaterView(res.content).unread[0]).toMatchObject({
      url: 'https://example.com/a',
      name: 'example.com',
    });
    if (res.ok) expect(addReadLaterUrl(res.content, 'https://example.com/a', now).ok).toBe(false);
    expect(addReadLaterUrl(content, 'javascript:alert(1)', now).ok).toBe(false);
  });
});

describe('.bookmarks.json', () => {
  const { content } = demo('.bookmarks.json');

  it('searches, filters by tag and sorts by use', () => {
    const all = bookmarksView(content, {}, now);
    expect(all.bookmarks.length).toBeGreaterThan(1);
    const hit = bookmarksView(content, { text: 'vitest' }, now).bookmarks;
    expect(hit.map((b) => b.title)).toContain('Vitest Guide');
    expect(
      bookmarksView(content, { tag: 'testing' }, now).bookmarks.every((b) =>
        b.tags.includes('testing'),
      ),
    ).toBe(true);
    const most = bookmarksView(content, { sort: 'MOST_USED' }, now).bookmarks.map(
      (b) => b.useCount,
    );
    expect(most).toEqual([...most].sort((a, b) => b - a));
    const least = bookmarksView(content, { sort: 'LEAST_USED' }, now).bookmarks.map(
      (b) => b.useCount,
    );
    expect(least).toEqual([...least].sort((a, b) => a - b));
  });

  it('ranks recent use above stale use for frecency', () => {
    const file = JSON.stringify({
      bookmarks: [
        { id: 'old', url: 'https://old.dev/', useCount: 10, lastUsedAt: '2025-01-01T00:00:00Z' },
        { id: 'new', url: 'https://new.dev/', useCount: 3, lastUsedAt: '2026-11-04T00:00:00Z' },
      ],
    });
    expect(bookmarksView(file, { sort: 'FRECENCY' }, now).bookmarks.map((b) => b.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('adds and deletes, refusing duplicates and non-http urls', () => {
    const res = addBookmarkEntry(content, { url: 'https://example.com', tags: [' x '] }, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = bookmarksView(res.content, {}, now).bookmarks[0];
    expect(added).toMatchObject({ url: 'https://example.com/', tags: ['x'] });
    expect(addBookmarkEntry(res.content, { url: 'https://example.com/' }, now).ok).toBe(false);
    expect(addBookmarkEntry(content, { url: 'ftp://x' }, now).ok).toBe(false);
    const gone = deleteBookmarkEntry(res.content, added?.id ?? '', now);
    expect(bookmarksView(gone, {}, now).bookmarks).toHaveLength(all(content));
  });
});
const all = (c: string): number => bookmarksView(c, {}, now).bookmarks.length;

describe('.budget.csv', () => {
  const { content } = demo('.budget.csv');

  it('summarises income, spending and series', () => {
    const view = budgetView(content);
    expect(view.income).toBeGreaterThan(0);
    expect(view.net).toBeCloseTo(view.income - view.spending);
    expect(view.categories[0]?.value).toBeGreaterThanOrEqual(view.categories[1]?.value ?? 0);
    expect(view.categories.some((c) => c.id === 'earnings')).toBe(false);
    expect(view.months.map((m) => m.month)).toEqual([...view.months.map((m) => m.month)].sort());
    expect(view.accounts.map((a) => a.id)).toContain('checking');
  });

  it('keeps the latest of repeated rows', () => {
    const csv =
      'name;account;category;date;value\nRent;a;running-costs;2026-01-01;100\nRent;a;running-costs;2026-02-01;120';
    expect(budgetView(csv)).toMatchObject({ spending: 120, income: 0, net: -120 });
  });
});

describe('.stocks.csv', () => {
  const { content } = demo('.stocks.csv');

  it('computes profit, drawdown and the chart series', () => {
    const view = stocksView(content);
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.series[0]).toMatchObject({ date: '2024-12-01', value: 5690, invested: 5000 });
    expect(view.series[1]?.invested).toBe(5500);
    expect(view.profit).toBeCloseTo(view.latestValue - view.invested);
    expect(view.allTimeHigh).toBeGreaterThanOrEqual(view.latestValue);
    expect(view.drawdownPct).toBeLessThanOrEqual(0);
    expect(view.changeVsPrev).not.toBeNull();
  });

  it('reads legacy semicolon files as cumulative totals, and empty files as null', () => {
    const view = stocksView(
      'timestamp;value;invest\n2025-01-01 09:00:00;1000;1000\n2025-02-01 09:00:00;1600;1500',
    );
    expect(view?.invested).toBe(1500);
    expect(stocksView('')).toBeNull();
  });

  // Regression: the web writes `DD.MM.YYYY HH:MM:SS` stamps and blank invest cells; the tile was empty.
  it('reads files the web wrote, with German timestamps and a header', () => {
    const view = stocksView(
      'timestamp,current value,invest\n01.12.2024 09:00:00,5690,5000\n01.01.2025 09:00:00,6100,500\n03.02.2025 10:30:00,6400,\n',
    );
    expect(view).toMatchObject({ latestValue: 6400, invested: 5500, profit: 900 });
    expect(view?.series.map((s) => s.date)).toEqual(['2024-12-01', '2025-01-01', '2025-02-03']);
  });
});

describe('.consumption.csv', () => {
  const { content } = demo('.consumption.csv');

  it('derives use per period and progress against the yearly target', () => {
    const meters = consumptionView(content);
    const power = meters.find((m) => m.key === 'Electricity');
    expect(power).toMatchObject({ title: 'Electricity', unit: 'kWh', yearlyTarget: 3500 });
    expect(power?.series[0]).toMatchObject({ date: '2025-12-01', use: 277 });
    expect(power?.lastPeriodUse).toBe(power?.series[power.series.length - 1]?.use);
    expect(meters.find((m) => m.key === 'Water')?.yearlyTarget).toBeUndefined();
    expect(meters.find((m) => m.key === 'Water')?.targetProgress).toBeNull();
  });

  it('computes trailing-year use once a year of readings exists', () => {
    const rows = Array.from(
      { length: 13 },
      (_, i) =>
        `${i < 12 ? '2025' : '2026'}-${String((i % 12) + 1).padStart(2, '0')}-01,${i * 100}`,
    );
    const [m] = consumptionView(`created,Gas[unit:m³;yearlyTarget:1200]\n${rows.join('\n')}`);
    expect(m).toMatchObject({ yearUse: 1200, targetProgress: 1 });
  });
});

describe('.data-collection.csv', () => {
  const { content } = demo('.data-collection.csv');

  it('builds a series with stats per number column', () => {
    const view = dataCollectionView(content);
    expect(view.columns.map((c) => c.name)).toEqual(['created', 'Weight', 'Mood']);
    const weight = view.series.find((s) => s.column === 'Weight');
    expect(weight?.unit).toBe('kg');
    expect(weight?.points[0]).toEqual({ x: '2026-10-15', y: 79.4 });
    expect(weight?.min).toBeLessThanOrEqual(weight?.average ?? 0);
    expect(weight?.max).toBeGreaterThanOrEqual(weight?.latest ?? 0);
    expect(view.rowCount).toBe(weight?.points.length);
  });

  it('handles comma-separated rows and empty files', () => {
    const view = dataCollectionView(
      'name::d,type::auto:date;name::N,type::number\n2026-01-01,5\n2026-01-02,7',
    );
    expect(view.series[0]).toMatchObject({ latest: 7, average: 6 });
    expect(dataCollectionView('')).toEqual({ columns: [], rowCount: 0, series: [] });
  });
});

describe('.prompts.md and .commands.md', () => {
  const prompts =
    '# Prompts\n\n## Review #code\n\nReview {{file}} for {{focus}} issues.\n\n## Plain #misc\n\nHello\n';
  const commands =
    '# Commands\n\n## Serve #dev\n\nStart it.\n\n```sh\nnpx serve -p {{port}} {{dir}}\n```\n';

  it('lists prompts with parameters, search and tag filter', () => {
    const view = promptsView(prompts);
    expect(view.rows.map((r) => r.parameters)).toEqual([['file', 'focus'], []]);
    expect(view.tags).toEqual(['code', 'misc']);
    expect(promptsView(prompts, { tag: 'misc' }).rows.map((r) => r.title)).toEqual(['Plain']);
    expect(promptsView(prompts, { text: 'FOCUS' }).rows).toHaveLength(1);
  });

  it('interpolates {{param}} and reports missing values', () => {
    const [row] = promptsView(prompts).rows;
    if (!row) throw new Error('no row');
    expect(interpolateTemplate(row.template, { file: 'a.ts', focus: 'perf' })).toBe(
      'Review a.ts for perf issues.',
    );
    expect(interpolateTemplate(row.template, { file: 'a.ts' })).toBe(
      'Review a.ts for {{focus}} issues.',
    );
    expect(missingParameters(row, { file: 'a.ts', focus: ' ' })).toEqual(['focus']);
  });

  it('extracts commands from code blocks with their notes', () => {
    const [row] = commandsView(commands).rows;
    expect(row).toMatchObject({
      title: 'Serve',
      template: 'npx serve -p {{port}} {{dir}}',
      note: 'Start it.',
      parameters: ['port', 'dir'],
    });
    expect(interpolateTemplate(row?.template ?? '', { port: '80', dir: '.' })).toBe(
      'npx serve -p 80 .',
    );
  });

  it('adds entries and validates', () => {
    const p = addPromptEntry(prompts, 'New #x', 'Do {{it}}', ['y']);
    expect(p.ok && promptsView(p.content).rows.find((r) => r.title === 'New')?.tags).toEqual([
      'y',
      'x',
    ]);
    expect(addPromptEntry(prompts, '', 'b').ok).toBe(false);
    expect(addPromptEntry(prompts, 't', ' ').ok).toBe(false);
    const c = addCommandEntry(commands, 'Build', 'make {{target}}', ['dev'], 'note');
    expect(c.ok && commandsView(c.content).rows.find((r) => r.title === 'Build')).toMatchObject({
      template: 'make {{target}}',
      note: 'note',
    });
    expect(addCommandEntry(commands, 'x', '').ok).toBe(false);
    expect(addCommandEntry(commands, '', 'x').ok).toBe(false);
  });
});
