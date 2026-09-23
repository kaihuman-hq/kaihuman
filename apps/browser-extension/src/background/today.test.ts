import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addReadLater,
  appendTodo,
  buildToday,
  checkInHabit,
  DEFAULT_ACTION_LOG_PATH,
  fetchToday,
  habitStreak,
  markRead,
  parseClocks,
  parseMilestones,
  parseTodoLines,
  type TodayCache,
  timerState,
  toggleTimer,
  upcomingEvents,
} from './today';

// Local time throughout: the console's widgets count days in the user's own timezone.
const NOW = new Date(2026, 8, 23, 10, 30);

const cache = (files: Record<string, string>, over: Partial<TodayCache> = {}): TodayCache => ({
  repo: 'o/r',
  appFolder: '.kh',
  actionLogPaths: [],
  files: Object.entries(files).map(([path, content]) => ({ path, sha: `sha-${path}`, content })),
  etag: null,
  fetchedAt: 1,
  ...over,
});

describe('upcomingEvents', () => {
  const csv = [
    'name;type;start iso date;end iso date',
    'Offsite;general;2026-09-25;2026-09-26',
    'Conference;general;2026-10-20;2026-10-22',
    'Trip;general;2026-09-20;2026-09-24',
    'Over;general;2026-09-01;2026-09-02',
    'Anna;birthday;1990-09-24;1990-09-24',
    'Mum;birthday;1962-11-21;1962-11-21',
  ].join('\n');

  it('keeps the next seven days, a birthday in its next year and an event still running', () => {
    const events = upcomingEvents('p.events.csv', csv, NOW);
    expect(events.map((e) => [e.name, e.daysUntil, e.date])).toEqual([
      ['Offsite', 2, '2026-09-25'],
      ['Trip', 0, '2026-09-20'],
      ['Anna', 1, '2026-09-24'],
    ]);
  });
});

describe('todos', () => {
  const md = [
    '---',
    'milestones:',
    '  - id: v1',
    '    name: Launch',
    '    dueDate: 2026-09-30',
    '  - id: v0',
    '    name: Alpha',
    '    dueDate: 2026-09-01',
    '---',
    '',
    '- [>] Implement demo mode #dev !v1',
    '::created:: 2026-09-01T00:00:00.000Z',
    '- [ ] Write announcement #marketing !v1',
    '- [ ] Fix the alpha bug !v0',
    '- [x] Done alpha thing !v0',
  ].join('\n');

  it('reads milestones and todo lines the way the console writes them', () => {
    expect(parseMilestones(md)).toEqual([
      { id: 'v1', name: 'Launch', dueDate: '2026-09-30' },
      { id: 'v0', name: 'Alpha', dueDate: '2026-09-01' },
    ]);
    expect(parseTodoLines(md)[0]).toEqual({
      text: 'Implement demo mode',
      status: 'in-progress',
      milestoneId: 'v1',
    });
  });

  it('summarises what is in progress, overdue and next due', () => {
    const today = buildToday(cache({ '.kh/projects.todos.md': md }), NOW);
    expect(today.inProgress).toEqual([
      { text: 'Implement demo mode', path: '.kh/projects.todos.md' },
    ]);
    expect(today.overdue).toEqual([
      { text: 'Fix the alpha bug', path: '.kh/projects.todos.md', milestone: 'Alpha' },
    ]);
    expect(today.milestone).toMatchObject({ name: 'Launch', daysUntil: 7, open: 2 });
  });

  it('counts the inbox backlog', () => {
    const inbox = '- [ ] one\n- [ ] two\n- [x] three\n';
    expect(buildToday(cache({ '.kh/inbox.todos.md': inbox }), NOW).inbox).toEqual({
      path: '.kh/inbox.todos.md',
      count: 2,
    });
  });

  it('appends a todo in the console format, tags last, leaving the file as it was', () => {
    expect(appendTodo(md, 'Call #admin the bank', '2026-09-23T08:00:00.000Z')).toBe(
      `${md}\n- [ ] Call the bank #admin\n::created:: 2026-09-23T08:00:00.000Z\n`,
    );
    expect(appendTodo('', 'First', 'T')).toBe('- [ ] First\n::created:: T\n');
    expect(() => appendTodo(md, '  #only-a-tag ', 'T')).toThrow('Nothing to add');
  });
});

describe('habits', () => {
  const csv = [
    'iso date;goal reached',
    '2026-09-19;x',
    '2026-09-20;',
    '2026-09-21;x',
    '2026-09-22;x',
  ].join('\n');

  it('counts the streak from yesterday until today is checked in', () => {
    expect(habitStreak(csv, NOW)).toBe(2);
    expect(habitStreak(checkInHabit(csv, '2026-09-23'), NOW)).toBe(3);
    expect(habitStreak('iso date;goal reached\n2026-09-10;x', NOW)).toBe(0);
  });

  it('checks in as the console does: sorted, header first, no trailing newline', () => {
    expect(checkInHabit('iso date;goal reached\n2026-09-22;x\n2026-09-20;\n', '2026-09-21')).toBe(
      'iso date;goal reached\n2026-09-20;\n2026-09-21;x\n2026-09-22;x',
    );
    // An unmarked day is marked rather than duplicated.
    expect(checkInHabit(csv, '2026-09-20')).toContain('2026-09-20;x');
  });

  it('reports each habit file with its name', () => {
    expect(buildToday(cache({ '.kh/health.habit.csv': csv }), NOW).habits).toEqual([
      { path: '.kh/health.habit.csv', name: 'health', checkedToday: false, streak: 2 },
    ]);
  });
});

describe('time tracking', () => {
  const csv = 'iso date;time\n2026-09-23;08:00,12:00,12:30\n2026-09-22;08:00,17:00\n';

  it('knows a running timer and the minutes already closed today', () => {
    expect(timerState(csv, NOW)).toEqual({
      running: true,
      closedMinutes: 240,
      runningSince: '12:30',
    });
    expect(timerState('iso date;time\n', NOW)).toEqual({ running: false, closedMinutes: 0 });
  });

  it('stops a running timer and starts a new day, newest first', () => {
    expect(toggleTimer(csv, NOW)).toBe(
      'iso date;time\n2026-09-23;08:00,12:00,12:30,10:30\n2026-09-22;08:00,17:00\n',
    );
    expect(toggleTimer('iso date;time\n2026-09-22;08:00,17:00\n', NOW)).toBe(
      'iso date;time\n2026-09-23;10:30\n2026-09-22;08:00,17:00\n',
    );
  });
});

describe('clocks', () => {
  it('labels each zone by its first city', () => {
    const json = JSON.stringify({
      timezones: [
        { name: 'Europe/Berlin', cities: ['Berlin', 'Munich'] },
        { name: 'Asia/Tokyo', cities: [] },
        { cities: ['nameless'] },
      ],
    });
    expect(parseClocks(json)).toEqual([
      { zone: 'Europe/Berlin', label: 'Berlin' },
      { zone: 'Asia/Tokyo', label: 'Tokyo' },
    ]);
    expect(parseClocks('not json')).toEqual([]);
  });
});

describe('read it later', () => {
  const json = JSON.stringify({
    items: [
      { id: 'a', url: 'https://a.example', name: 'A', status: 'new', tags: [], createdAt: 30 },
      { id: 'b', url: 'https://b.example', name: 'B', status: 'read', tags: [], createdAt: 10 },
      { id: 'c', url: 'https://c.example', name: 'C', status: 'new', tags: [], createdAt: 20 },
    ],
  });

  it('lists the oldest unread items first', () => {
    const today = buildToday(cache({ 'x.readitlater.json': json }), NOW);
    expect(today.readLater.map((item) => item.id)).toEqual(['c', 'a']);
  });

  it('marks an item read, keeping the rest', () => {
    const next = JSON.parse(markRead(json, 'a', 99));
    expect(next.items[0]).toMatchObject({ id: 'a', status: 'read', updatedAt: 99 });
    expect(next.items).toHaveLength(3);
    expect(() => markRead(json, 'gone', 99)).toThrow('no longer on the list');
  });

  it('adds a page once, to a new file too', () => {
    const added = JSON.parse(addReadLater('', { url: 'https://d.example', title: ' D ' }, 5, 'd'));
    expect(added.items).toEqual([
      {
        id: 'd',
        url: 'https://d.example',
        name: 'D',
        status: 'new',
        tags: [],
        createdAt: 5,
        updatedAt: 5,
      },
    ]);
    expect(() => addReadLater(json, { url: 'https://a.example', title: 'A' }, 5, 'x')).toThrow(
      'Already on the read-later list',
    );
  });
});

describe('buildToday', () => {
  it('prefers the app folder’s action log and falls back on the worker default', () => {
    expect(
      buildToday(
        cache({}, { actionLogPaths: ['notes/x.actionlog.md', '.kh/daily.actionlog.md'] }),
        NOW,
      ).actionLogPath,
    ).toBe('.kh/daily.actionlog.md');
    expect(buildToday(cache({}), NOW).actionLogPath).toBe(DEFAULT_ACTION_LOG_PATH);
  });
});

describe('fetchToday', () => {
  afterEach(() => vi.unstubAllGlobals());

  const tree = {
    tree: [
      { path: '.kh/health.habit.csv', type: 'blob', sha: 'h1' },
      { path: '.kh/projects.todos.md', type: 'blob', sha: 't2' },
      { path: '.kh/daily.actionlog.md', type: 'blob', sha: 'l1' },
      { path: 'notes/readme.md', type: 'blob', sha: 'n1' },
    ],
  };

  it('reads only the files whose blob changed, and lists the action logs', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/git/trees/')
        ? { ok: true, status: 200, json: async () => tree, headers: { get: () => 'etag-2' } }
        : { ok: true, status: 200, text: async () => 'fresh todos' },
    );
    vi.stubGlobal('fetch', fetchMock);
    const previous = cache({ '.kh/health.habit.csv': 'cached habit' });
    previous.files[0] = { ...(previous.files[0] as TodayCache['files'][0]), sha: 'h1' };

    const next = await fetchToday('t', 'o/r', previous);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.github.com/repos/o/r/contents/.kh/projects.todos.md',
    );
    expect(next.files.map((f) => [f.path, f.content])).toEqual([
      ['.kh/health.habit.csv', 'cached habit'],
      ['.kh/projects.todos.md', 'fresh todos'],
    ]);
    expect(next.actionLogPaths).toEqual(['.kh/daily.actionlog.md']);
    expect(next.appFolder).toBe('.kh');
    expect(next.etag).toBe('etag-2');
  });

  it('replays the ETag and keeps the cache on a 304', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 304 }));
    vi.stubGlobal('fetch', fetchMock);
    const previous = cache({ 'a.habit.csv': 'x' }, { etag: 'etag-1' });

    const next = await fetchToday('t', 'o/r', previous);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({
      headers: { 'If-None-Match': 'etag-1' },
    });
    expect(next.files).toEqual(previous.files);
    expect(next.fetchedAt).toBeGreaterThan(previous.fetchedAt);
  });
});
