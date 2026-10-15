import type { StreamsFile } from '@kaihuman/formats';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TodayCache } from '../today.js';
import type { WorkSnapshot } from '../work/types.js';
import { bulletsOf, draftReview, type ReviewSources, rangeStart, reviewSources } from './review.js';

// Thursday, local time.
const NOW = new Date(2026, 9, 15, 10, 0, 0);
const local = (d: number, h = 12) => new Date(2026, 9, d, h).toISOString();

const logFile = [
  '---',
  '---',
  '',
  '# Action Log',
  '',
  '- 2026-10-11 09:00:00 Sunday before the week',
  '- 2026-10-13 09:00:00 Tuesday work #work',
  '- 2026-10-14 08:00:00 Wrote the spec #docs',
  '- 2026-10-15 09:30:00 Fixed login',
  '- 2026-10-16 09:00:00 Tomorrow, not yet',
].join('\n');

const item = (id: string, title: string, doneAt?: string) => ({
  id,
  url: `https://x/${id}`,
  title,
  labels: [],
  addedAt: '',
  extra: {},
  ...(doneAt ? { doneAt } : {}),
});

const streams = {
  version: 1,
  updatedAt: '',
  invalidStreams: [],
  extra: {},
  streams: [
    {
      id: 'st_a',
      name: 'A',
      createdAt: '',
      invalidItems: [],
      extra: {},
      items: [
        item('it_1', 'Old item', local(13)),
        item('it_2', 'Recent item', local(14)),
        item('it_3', 'Open item'),
      ],
    },
  ],
} as unknown as StreamsFile;

const pr = (n: number, state: string, updatedAt: string) => ({
  key: `a/b#${n}`,
  url: `https://github.com/a/b/pull/${n}`,
  repo: 'a/b',
  number: n,
  kind: 'pr',
  title: `PR ${n}`,
  state,
  updatedAt,
});
const snapshot = {
  pinned: {
    'a/b#1': pr(1, 'merged', local(14)),
    'a/b#2': pr(2, 'merged', local(9)),
    'a/b#3': pr(3, 'open', local(14)),
    'a/b#4': { key: 'a/b#4', error: 'not-found', org: 'a' },
  },
} as unknown as WorkSnapshot;

const todayCache = {
  files: [
    {
      path: '.kh/work.timetracking.csv',
      sha: '',
      content: 'date;time\n2026-10-14;09:00,11:00\n2026-10-09;09:00,10:00',
    },
  ],
} as unknown as TodayCache;

const data = { logs: [logFile], streams, snapshot, todayCache };

describe('review ranges', () => {
  it('standup range starts yesterday 00:00, week range starts Monday 00:00', () => {
    expect(rangeStart('standup', NOW)).toEqual(new Date(2026, 9, 14, 0, 0, 0));
    expect(rangeStart('week', NOW)).toEqual(new Date(2026, 9, 12, 0, 0, 0));
    // A Sunday belongs to the week that started six days earlier.
    expect(rangeStart('week', new Date(2026, 9, 18, 10))).toEqual(new Date(2026, 9, 12));

    expect(reviewSources('standup', NOW, data).log.map((e) => e.description)).toEqual([
      'Wrote the spec #docs',
      'Fixed login',
    ]);
    expect(reviewSources('week', NOW, data).log.map((e) => e.description)).toEqual([
      'Tuesday work #work',
      'Wrote the spec #docs',
      'Fixed login',
    ]);
  });

  it('merged comes from pinned statuses merged in range, done from stream doneAt', () => {
    const standup = reviewSources('standup', NOW, data);
    expect(standup.done.map((d) => d.title)).toEqual(['Recent item']);
    expect(standup.merged.map((m) => m.title)).toEqual(['PR 1']);
    const week = reviewSources('week', NOW, data);
    expect(week.done.map((d) => d.title)).toEqual(['Old item', 'Recent item']);
    expect(week.merged.map((m) => m.title)).toEqual(['PR 1']);
    expect(week.minutes).toEqual([{ name: '2026-10-14', minutes: 120 }]);
  });
});

describe('bulletsOf', () => {
  it('lists every source without the model', () => {
    const text = bulletsOf(reviewSources('standup', NOW, data));
    expect(text).toContain('- Logged: Wrote the spec #docs');
    expect(text).toContain('- Logged: Fixed login');
    expect(text).toContain('- Done: Recent item');
    expect(text).toContain('- Merged: PR 1');
    expect(text).toContain('- Tracked 2h 0m on 2026-10-14');
  });
});

describe('draftReview', () => {
  const sources: ReviewSources = {
    log: [{ timestamp: '2026-10-15 09:30:00', description: 'Fixed login', tags: [] }],
    done: [],
    merged: [],
    minutes: [],
  };
  let prompts: { input: string; constraint: unknown }[] = [];
  const stub = (answer: string, availability = 'available') => {
    prompts = [];
    vi.stubGlobal('LanguageModel', {
      availability: async () => availability,
      create: async () => ({
        prompt: async (input: string, options?: { responseConstraint?: unknown }) => {
          prompts.push({ input, constraint: options?.responseConstraint });
          return answer;
        },
        destroy: () => {},
      }),
    });
  };
  afterEach(() => vi.unstubAllGlobals());

  it('sends a schema capped at eight bullets and returns validated markdown', async () => {
    stub(JSON.stringify({ bullets: ['Fixed the login bug', '- Wrote the spec'] }));
    expect(await draftReview(sources, 'standup')).toBe('- Fixed the login bug\n- Wrote the spec');
    expect(JSON.stringify(prompts[0]?.constraint)).toContain('"maxItems":8');
    expect(prompts[0]?.input).toContain('Fixed login');
  });

  it('refuses an invalid answer', async () => {
    stub(JSON.stringify({ bullets: Array.from({ length: 9 }, (_, i) => `b${i}`) }));
    expect(await draftReview(sources, 'week')).toBeNull();
    stub(JSON.stringify({ bullets: [''] }));
    expect(await draftReview(sources, 'week')).toBeNull();
  });

  it('is null without the model, and asks nothing about an empty week', async () => {
    stub('{}', 'unavailable');
    expect(await draftReview(sources, 'week')).toBeNull();
    stub(JSON.stringify({ bullets: ['x'] }));
    expect(await draftReview({ log: [], done: [], merged: [], minutes: [] }, 'week')).toBeNull();
    expect(prompts).toHaveLength(0);
  });
});
