import type { GithubKey, StreamItem, StreamsFile } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import type { TodayCache, TodaySummary } from '../today.js';
import type { PinnedStatus, WorkItemStatus, WorkSnapshot } from '../work/types.js';
import { buildWorkContext, contextText } from './context.js';

const item = (n: number, url: string, over: Partial<StreamItem> = {}): StreamItem =>
  ({
    id: `i${n}`,
    url,
    title: `Item ${n}`,
    addedAt: '2026-01-01T00:00:00Z',
    labels: [],
    extra: {},
    ...over,
  }) as StreamItem;

const file = (streams: { name: string; items: StreamItem[] }[]): StreamsFile =>
  ({
    version: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    streams: streams.map((s, i) => ({
      id: `s${i}`,
      name: s.name,
      createdAt: '2026-01-01T00:00:00Z',
      items: s.items,
      invalidItems: [],
      extra: {},
    })),
    invalidStreams: [],
    extra: {},
  }) as StreamsFile;

const summary = (over: Partial<TodaySummary> = {}): TodaySummary =>
  ({ events: [], inProgress: [], overdue: [], resurface: [], ...over }) as unknown as TodaySummary;

const cache = (files: Record<string, string> = {}): TodayCache => ({
  repo: 'o/r',
  appFolder: '.kh',
  actionLogPaths: [],
  files: Object.entries(files).map(([path, content]) => ({ path, sha: 's', content })),
  etag: null,
  fetchedAt: 1,
});

const status = (n: number, over: Partial<WorkItemStatus> = {}): WorkItemStatus => ({
  key: `o/r#${n}` as GithubKey,
  url: `https://github.com/o/r/pull/${n}`,
  repo: 'o/r',
  number: n,
  kind: 'pr',
  title: `PR ${n}`,
  state: 'open',
  isDraft: false,
  review: null,
  ci: null,
  conflict: false,
  updatedAt: `2026-01-0${n}T00:00:00Z`,
  ...over,
});

const snapshot = (over: Partial<WorkSnapshot> = {}): WorkSnapshot => ({
  login: 'me',
  fetchedAt: 1,
  searches: {
    'review-requested': [],
    assigned: [],
    failing: [],
    'changes-requested': [],
    'ready-to-merge': [],
    mine: [],
  },
  threads: [],
  pinned: {},
  orgProblems: [],
  problem: null,
  ...over,
});

const build = (over: Partial<Parameters<typeof buildWorkContext>[0]> = {}) =>
  buildWorkContext({
    today: summary(),
    todayCache: cache(),
    streams: null,
    snapshot: undefined,
    ...over,
  });

describe('buildWorkContext', () => {
  it('collects repos and hosts per stream from open items', () => {
    const streams = file([
      {
        name: 'Launch',
        items: [
          item(1, 'https://github.com/acme/web/pull/1', { labels: ['ship'] }),
          item(2, 'https://github.com/acme/web/issues/2', { labels: ['ship', 'bug'] }),
          item(3, 'https://example.com/post', { title: 'A post' }),
          item(4, 'https://github.com/acme/old/pull/4', { doneAt: '2026-01-02T00:00:00Z' }),
        ],
      },
    ]);
    expect(build({ streams }).streams).toEqual([
      {
        name: 'Launch',
        repos: ['acme/web'],
        hosts: ['example.com'],
        labels: ['ship', 'bug'],
        titles: ['Item 1', 'Item 2', 'A post'],
      },
    ]);
  });

  it('waiting is the top 3 by urgency', () => {
    const snap = snapshot({
      searches: {
        ...snapshot().searches,
        assigned: [status(1, { title: 'assigned' })],
        failing: [status(2, { title: 'failing' })],
        'changes-requested': [status(3, { title: 'changes' })],
        'ready-to-merge': [status(4, { title: 'ready' })],
      },
    });
    expect(build({ snapshot: snap }).waiting).toEqual(['failing', 'changes', 'ready']);
  });

  it('lists red CI of pinned items, today events, todo tags and open ideas', () => {
    const streams = file([{ name: 'S', items: [item(1, 'https://github.com/o/r/pull/1')] }]);
    const snap = snapshot({
      pinned: { 'o/r#1': status(1, { title: 'Broken', ci: 'failure' }) as PinnedStatus },
    });
    const ctx = build({
      streams,
      snapshot: snap,
      today: summary({
        events: [
          { name: 'Standup', type: 'x', date: 'd', daysUntil: 0, path: 'p' },
          { name: 'Later', type: 'x', date: 'd', daysUntil: 2, path: 'p' },
        ],
        inProgress: [{ text: 'Write docs', path: 'p' }],
      }),
      todayCache: cache({
        '.kh/a.todos.md': '- [ ] one #dev\n- [x] two #old\n- [>] three #ops #dev\n',
        '.kh/ideas/open-one.md': '---\nstatus: seed\n---\n# Open one\n',
        '.kh/ideas/done-one.md': '---\nstatus: shipped\n---\n# Done one\n',
      }),
    });
    expect(ctx.redCi).toEqual(['Broken']);
    expect(ctx.eventsToday).toEqual(['Standup']);
    expect(ctx.todos).toEqual(['Write docs']);
    expect([...ctx.todoTags].sort()).toEqual(['dev', 'ops']);
    expect(ctx.openIdeas).toEqual(['Open one']);
  });

  it('is empty without streams or a snapshot', () => {
    expect(build()).toMatchObject({ streams: [], waiting: [], redCi: [] });
  });
});

describe('contextText', () => {
  it('stays under 2,000 characters for 50 streams', () => {
    const streams = file(
      Array.from({ length: 50 }, (_, i) => ({
        name: `Stream number ${i}`,
        items: Array.from({ length: 8 }, (_, j) =>
          item(j, `https://github.com/org${i}/repo${j}/pull/${j + 1}`, {
            title: `A fairly long item title ${i}-${j}`,
            labels: [`label-${i}-${j}`],
          }),
        ),
      })),
    );
    const text = contextText(build({ streams }));
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain('Stream number 0');
  });
});
