import { describe, expect, it } from 'vitest';
import {
  actionLogView,
  addBookmarkEntry,
  addEvent,
  addReadLaterUrl,
  addTodoTask,
  addTravelTrip,
  boardOverviewView,
  bookmarksView,
  commandsView,
  eventsView,
  type FeedSnapshot,
  promptsView,
  readLaterView,
  rssView,
  setTodoStatusAt,
  todosView,
  travelView,
  worldClocksView,
} from '../../../components/widgets/tile-controllers.js';
import {
  boardGlance,
  bookmarksGlance,
  clocksGlance,
  commandsGlance,
  eventsGlance,
  logGlance,
  promptsGlance,
  readLaterGlance,
  rssGlance,
  todosGlance,
  travelGlance,
} from './lists.js';

const NOW = new Date(2026, 10, 10, 10, 0, 0);
const text = (r: { ok: boolean; content?: string; error?: string }): string => {
  if (!r.ok) throw new Error(r.error);
  return r.content as string;
};
const input = (path: string, content: string) => ({ path, content, now: NOW });

describe('todosGlance', () => {
  const path = '.kh/todos.todos.md';
  let content = '';
  for (const [t, due] of [
    ['Overdue one', '2026-11-08'],
    ['Plain', undefined],
    ['Active', undefined],
    ['Finished', undefined],
  ] as const)
    content = text(addTodoTask(content, t, NOW, [], due ? { due: { date: due } } : {}));
  const idx = (name: string) =>
    todosView(content, NOW).rows.find((r) => r.text === name)?.index ?? -1;
  content = text(setTodoStatusAt(content, idx('Active'), 'in-progress', NOW));
  content = text(setTodoStatusAt(content, idx('Finished'), 'done', NOW));

  it('counts open, doing and overdue with a share bar and an add screen', () => {
    const g = todosGlance(input(path, content), todosView(content, NOW));
    expect(g).toMatchObject({ title: 'Todos', icon: 'todo', tint: 'olive', hero: '', label: '' });
    expect(g.counts).toEqual([
      { value: 2, label: 'open', tone: 'label' },
      { value: 1, label: 'doing', tone: 'info' },
      { value: 1, label: 'overdue', tone: 'warning' },
    ]);
    expect(g.viz).toMatchObject({
      kind: 'segments',
      parts: [
        { value: 1, tone: 'info' },
        { value: 1, tone: 'accent' },
        { value: 1, tone: 'warning' },
        { value: 1, tone: 'muted' },
      ],
    });
    expect(g.action).toMatchObject({
      kind: 'open',
      label: 'New todo',
      href: `/dashboard/todo-add?path=${encodeURIComponent(path)}`,
    });
  });
});

describe('eventsGlance', () => {
  let content = '';
  for (const [name, d] of [
    ['Ship party', '2026-11-14'],
    ['Dentist', '2026-11-20'],
    ['Conf', '2026-11-25'],
    ['Later', '2027-01-05'],
  ] as const)
    content = text(addEvent(content, { name, startDate: d }));

  it('counts down to the next event with the rest of the month', () => {
    const g = eventsGlance(input('.kh/e.events.csv', content), eventsView(content, NOW));
    expect(g).toMatchObject({ icon: 'calendar', tint: 'red', hero: '4', unit: 'days', label: '' });
    expect(g.viz).toEqual({
      kind: 'text',
      title: 'Ship party',
      caption: 'Sat 14 Nov · +2 this month',
    });
    expect(g.action).toMatchObject({
      kind: 'open',
      label: 'Add event',
      href: '/dashboard/tile?path=.kh%2Fe.events.csv&add=1',
    });
  });
  it('says Today without a unit', () => {
    const c = text(addEvent('', { name: 'Now', startDate: '2026-11-10' }));
    const g = eventsGlance(input('a.events.csv', c), eventsView(c, NOW));
    expect(g.hero).toBe('Today');
    expect(g.unit).toBeUndefined();
  });
  it('handles an empty file', () => {
    const g = eventsGlance(input('a.events.csv', ''), []);
    expect(g).toMatchObject({ hero: '0', label: 'no upcoming' });
  });
});

describe('logGlance', () => {
  const path = '.kh/work-log.actionlog.md';
  const content =
    '# Log\n\n- 2026-11-09 23:00:00 Yesterday thing\n- 2026-11-10 08:15:00 Ran tests #dev\n- 2026-11-10 09:41:00 Wrote the glance code\n';
  it('shows entries today and the latest one', () => {
    const g = logGlance(input(path, content), actionLogView(content));
    expect(g).toMatchObject({
      title: 'Work log',
      icon: 'list',
      tint: 'purple',
      hero: '2',
      label: 'entries today',
    });
    expect(g.viz).toEqual({ kind: 'text', time: '09:41', title: 'Wrote the glance code' });
  });
  it('logs from the field', () => {
    const g = logGlance(input(path, content), actionLogView(content));
    if (g.action?.kind !== 'field') throw new Error('field');
    expect(g.action).toMatchObject({ label: 'Log entry', placeholder: 'What did you do?' });
    const out = g.action.submit(content, 'Did it', NOW);
    expect(out.ok && out.content).toContain('Did it');
    expect(g.action.submit(content, ' ', NOW).ok).toBe(false);
  });
});

describe('clocksGlance', () => {
  const content = JSON.stringify({
    timezones: [
      { id: 'a', name: 'Europe/Berlin', offset: '+01:00', cities: ['Berlin'] },
      { id: 'b', name: 'Asia/Tokyo', offset: '+09:00', cities: ['Tokyo'] },
      { id: 'c', name: 'America/New_York', offset: '-05:00', cities: [] },
      { id: 'd', name: 'UTC', offset: '+00:00', cities: [] },
    ],
  });
  const at = new Date('2026-11-05T12:00:00Z');
  it('leads with the first clock and lists the next two', () => {
    const g = clocksGlance(
      { path: 'a.timezones.json', content, now: at },
      worldClocksView(content, at),
    );
    expect(g).toMatchObject({
      title: 'Clocks',
      icon: 'globe',
      tint: 'blue',
      hero: '13:00',
      label: 'Berlin · Thu',
    });
    expect(g.viz).toEqual({
      kind: 'rows',
      rows: [
        { left: 'Tokyo', right: '21:00' },
        { left: 'New York', right: '07:00' },
      ],
    });
    expect(g.action).toBeUndefined();
  });
  it('copes with no clocks', () => {
    expect(clocksGlance(input('a', ''), []).label).toBe('no clocks');
  });
});

describe('readLaterGlance', () => {
  let content = '';
  content = text(addReadLaterUrl(content, 'https://a.test/x', new Date(2026, 10, 9), 'Old read'));
  content = text(addReadLaterUrl(content, 'https://b.test/y', NOW, 'Fresh read'));
  it('counts unread and names the top item', () => {
    const g = readLaterGlance(input('a.readitlater.json', content), readLaterView(content));
    expect(g).toMatchObject({
      title: 'Read later',
      icon: 'bookmark',
      tint: 'purple',
      hero: '2',
      label: 'unread',
    });
    expect(g.viz).toEqual({ kind: 'text', title: 'Fresh read' });
  });
  it('saves a link from the field', () => {
    const g = readLaterGlance(input('a.readitlater.json', content), readLaterView(content));
    if (g.action?.kind !== 'field') throw new Error('field');
    expect(g.action).toMatchObject({
      label: 'Save link',
      placeholder: 'https://',
      keyboard: 'url',
    });
    expect(g.action.submit(content, 'https://c.test', NOW).ok).toBe(true);
    expect(g.action.submit(content, 'nope', NOW).ok).toBe(false);
  });
});

describe('bookmarksGlance', () => {
  let content = '';
  for (const [url, at] of [
    ['https://old.test/', new Date(2026, 9, 1)],
    ['https://github.com/x', new Date(2026, 10, 8)],
    ['https://www.nytimes.com/a', new Date(2026, 10, 9)],
    ['https://a.test/', new Date(2026, 10, 9)],
    ['https://b.test/', new Date(2026, 10, 9)],
    ['https://c.test/', new Date(2026, 10, 10)],
  ] as const)
    content = text(addBookmarkEntry(content, { url }, at));
  it('counts saved, this week and letter chips', () => {
    const g = bookmarksGlance(input('a.bookmarks.json', content), bookmarksView(content, {}, NOW));
    expect(g).toMatchObject({
      icon: 'star',
      tint: 'blue',
      hero: '6',
      label: 'saved · 5 this week',
    });
    expect(g.viz).toEqual({ kind: 'chips', labels: ['C', 'B', 'A', 'N', '+2'] });
  });
  it('adds a bookmark from the field', () => {
    const g = bookmarksGlance(input('a.bookmarks.json', content), bookmarksView(content, {}, NOW));
    if (g.action?.kind !== 'field') throw new Error('field');
    expect(g.action).toMatchObject({ label: 'Add bookmark', keyboard: 'url' });
    expect(g.action.submit(content, 'https://new.test', NOW).ok).toBe(true);
    expect(g.action.submit(content, 'https://c.test', NOW).ok).toBe(false);
  });
});

describe('promptsGlance and commandsGlance', () => {
  const prompts =
    '# Prompts\n\n## Review #code\n\nReview {{file}} for {{focus}} issues.\n\n## Plain #misc\n\nHello\n';
  const commands =
    '# Commands\n\n## Serve #dev\n\nStart it.\n\n```sh\nnpx serve -p {{port}} {{dir}}\n```\n';
  it('copies the first prompt', () => {
    const g = promptsGlance(input('a.prompts.md', prompts), promptsView(prompts));
    expect(g).toMatchObject({ icon: 'prompt', tint: 'purple', hero: '2', label: 'templates' });
    expect(g.viz).toEqual({
      kind: 'copy',
      label: 'Review',
      text: 'Review {{file}} for {{focus}} issues.',
    });
    expect(g.action).toBeUndefined();
  });
  it('copies the first command in mono', () => {
    const g = commandsGlance(input('a.commands.md', commands), commandsView(commands));
    expect(g).toMatchObject({ icon: 'terminal', tint: 'olive', hero: '1', label: 'snippets' });
    expect(g.viz).toMatchObject({ kind: 'copy', label: 'Serve', mono: true });
    expect((g.viz as { text: string }).text).toContain('npx serve');
  });
  it('has no chip when empty', () => {
    expect(promptsGlance(input('a', ''), promptsView('')).viz).toBeUndefined();
  });
});

describe('rssGlance', () => {
  const content = JSON.stringify({
    feedOptions: [
      { id: 'f1', url: 'https://a.test/feed', read: ['g1'] },
      { id: 'f2', url: 'https://b.test/rss', read: [] },
    ],
    readLater: [],
  });
  const snap: FeedSnapshot = {
    'https://a.test/feed': {
      title: 'Alpha',
      fetchedAt: 1,
      loading: false,
      items: [
        { title: 'One', link: 'https://a.test/1', guid: 'g1', pubDate: '2026-11-09T00:00:00Z' },
        { title: 'Two', link: 'https://a.test/2', guid: 'g2', pubDate: '2026-11-05T00:00:00Z' },
      ],
    },
    'https://b.test/rss': {
      fetchedAt: 1,
      loading: false,
      items: [
        { title: 'Three', link: 'https://b.test/3', guid: 'g3', pubDate: '2026-11-08T00:00:00Z' },
      ],
    },
  };
  it('counts unread and shows the newest unread item', () => {
    const g = rssGlance(input('a.rss.json', content), rssView(content, snap, NOW));
    expect(g).toMatchObject({
      title: 'Feeds',
      icon: 'rss',
      tint: 'orange',
      hero: '2',
      label: 'unread · 2 feeds',
    });
    expect(g.viz).toEqual({ kind: 'text', title: 'Three', caption: 'b.test' });
    expect(g.action).toBeUndefined();
  });
});

describe('travelGlance', () => {
  const file = JSON.stringify({
    version: 1,
    currency: 'EUR',
    trips: [
      {
        id: 'a',
        title: 'Rome',
        start: '2026-11-28',
        end: '2026-12-03',
        custom: [],
        steps: [1, 2, 3, 4].map((n) => ({
          id: `s${n}`,
          type: 'general',
          custom: [],
          title: `Step ${n}`,
        })),
      },
    ],
  });
  it('counts down to the next trip', () => {
    const g = travelGlance(input('.kh/t.travel.json', file), travelView(file, NOW));
    expect(g).toMatchObject({ icon: 'travel', tint: 'blue', hero: '18', unit: 'days' });
    expect(g.viz).toMatchObject({
      kind: 'text',
      title: 'Rome',
      caption: '28 Nov – 3 Dec · 4 steps',
    });
    expect(g.action).toMatchObject({
      kind: 'open',
      label: 'Add trip',
      href: '/dashboard/tile?path=.kh%2Ft.travel.json&add=1',
    });
  });
  it('falls back to the trip count', () => {
    const c = text(
      addTravelTrip('', { name: 'Old', start: '2026-01-01', end: '', destination: '' }, 'x'),
    );
    const g = travelGlance(input('t.travel.json', c), travelView(c, NOW));
    expect(g).toMatchObject({ hero: '1', label: 'trips' });
    expect(g.viz).toBeUndefined();
  });
});

describe('boardGlance', () => {
  const files = [
    { path: 'a.todos.md', content: '# T\n\n- [ ] one\n- [ ] x\n- [>] two\n- [x] three\n' },
  ];
  it('counts open items, flags overdue and bars the columns', () => {
    const view = boardOverviewView('{"showDone":true}', files, NOW);
    const g = boardGlance(input('a.board-overview.json', '{}'), view);
    expect(g).toMatchObject({
      title: 'Board',
      icon: 'board',
      tint: 'olive',
      hero: '3',
      label: 'open',
    });
    expect(g.delta).toEqual({ text: '1 overdue', tone: 'warning' });
    expect(g.viz).toEqual({
      kind: 'bars',
      values: [2, 1, 1],
      labels: ['Inbox', 'Doing', 'Done'],
      accent: 1,
    });
    expect(g.action).toBeUndefined();
  });
  it('omits the delta without overdue items', () => {
    const view = boardOverviewView('{}', [], NOW);
    expect(boardGlance(input('a', '{}'), view).delta).toBeUndefined();
  });
});
