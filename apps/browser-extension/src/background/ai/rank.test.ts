import type { ReadItLaterItem } from '@kaihuman/formats';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../bookmarks';
import type { WorkContext } from './context';
import { applyRanking, archiveCandidates, likelyNext, readLaterForToday, rerank } from './rank';

type Schema = { properties?: { ranked?: { maxItems?: number } } };

const fakeModel = (answer: unknown, availability = 'available') => {
  const prompts: { input: string; schema?: Schema }[] = [];
  const model = {
    availability: vi.fn(async () => availability),
    create: vi.fn(async () => ({
      prompt: async (input: string, options?: { responseConstraint?: Schema }) => {
        prompts.push({ input, schema: options?.responseConstraint });
        return JSON.stringify(answer);
      },
      destroy: () => {},
    })),
  };
  vi.stubGlobal('LanguageModel', model);
  return { model, prompts };
};

beforeEach(() => {
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}), set: async () => {} } } });
});
afterEach(() => vi.unstubAllGlobals());

const NOW = new Date('2026-10-15T10:00:00.000Z');
const DAY = 86_400_000;

const ctx = (over: Partial<WorkContext> = {}): WorkContext => ({
  streams: [],
  todos: [],
  todoTags: [],
  eventsToday: [],
  waiting: [],
  redCi: [],
  openIdeas: [],
  ...over,
});

const bookmark = (id: string, url: string, useCount = 1, tags: string[] = []): Bookmark => ({
  id,
  url,
  title: `Title ${id}`,
  tags,
  createdAt: '',
  updatedAt: '',
  useCount,
  lastUsedAt: NOW.toISOString(),
  pinned: false,
});

const stream = (over: Partial<WorkContext['streams'][number]>) => ({
  name: 'Payments',
  repos: [],
  hosts: [],
  labels: [],
  titles: [],
  ...over,
});

describe('rerank', () => {
  const items = [
    { id: 'a', text: 'Alpha' },
    { id: 'b', text: 'Beta' },
  ];

  it('refuses duplicate or unknown ids', async () => {
    fakeModel({
      ranked: [
        { id: 'a', reason: 'x' },
        { id: 'a', reason: 'y' },
      ],
    });
    expect(await rerank('rank', items, ctx())).toBeNull();
    fakeModel({ ranked: [{ id: 'zzz', reason: 'x' }] });
    expect(await rerank('rank', items, ctx())).toBeNull();
  });

  it('sends an id enum and keeps the reasons of a valid answer', async () => {
    const { prompts } = fakeModel({
      ranked: [
        { id: 'b', reason: 'Open PR' },
        { id: 'a', reason: '' },
      ],
    });
    const ranking = await rerank('rank', items, ctx());
    expect(ranking?.ids).toEqual(['b', 'a']);
    expect(ranking?.reasons).toEqual({ b: 'Open PR' });
    expect(JSON.stringify(prompts[0]?.schema)).toContain('"enum":["a","b"]');
  });

  it('is null without the model or items', async () => {
    expect(await rerank('rank', items, ctx())).toBeNull();
    fakeModel({ ranked: [] });
    expect(await rerank('rank', [], ctx())).toBeNull();
  });
});

describe('applyRanking', () => {
  it('drops missing and appends new items', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const ranking = { ids: ['c', 'gone', 'a'], reasons: {}, computedAt: 0 };
    expect(applyRanking(items, ranking).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps rule order with no ranking', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(applyRanking(items, undefined)).toEqual(items);
  });
});

describe('likelyNext', () => {
  it('boosts stream matches without the model', async () => {
    const list = [
      bookmark('plain', 'https://other.example/x', 3),
      bookmark('repo', 'https://github.com/acme/payments', 2),
      bookmark('tag', 'https://t.example', 2, ['backend']),
    ];
    const context = ctx({
      streams: [stream({ repos: ['acme/payments'], labels: ['backend'] })],
    });
    const ranking = await likelyNext(list, context, NOW);
    // Same frecency for repo and tag, lifted by 1 and 0.5; plain has the most uses and no boost.
    expect(ranking.ids).toEqual(['repo', 'tag', 'plain']);
  });

  it('sends at most 12 to the model', async () => {
    const list = Array.from({ length: 30 }, (_, i) =>
      bookmark(`b${i}`, `https://s${i}.example`, 30 - i),
    );
    const { prompts } = fakeModel({ ranked: [{ id: 'b3', reason: 'Fits Payments' }] });
    const ranking = await likelyNext(list, ctx(), NOW);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.input.match(/^b\d+:/gm)).toHaveLength(12);
    expect(prompts[0]?.schema?.properties?.ranked?.maxItems).toBe(12);
    expect(ranking.ids).toHaveLength(20);
    expect(ranking.ids.slice(0, 2)).toEqual(['b3', 'b0']);
    expect(ranking.reasons).toEqual({ b3: 'Fits Payments' });
  });
});

const read = (id: string, createdAt: number, status: 'new' | 'read' = 'new'): ReadItLaterItem => ({
  id,
  url: `https://${id}.example`,
  status,
  name: id,
  tags: [],
  createdAt,
  updatedAt: createdAt,
});

describe('readLaterForToday', () => {
  it('falls back to oldest first', async () => {
    const ranking = await readLaterForToday(
      [read('new', 300), read('old', 100), read('mid', 200)],
      ctx(),
    );
    expect(ranking.ids).toEqual(['old', 'mid', 'new']);
    expect(ranking.reasons).toEqual({});
  });

  it('lets the model reorder, with reasons', async () => {
    fakeModel({ ranked: [{ id: 'new', reason: 'About Payments' }] });
    const ranking = await readLaterForToday([read('new', 300), read('old', 100)], ctx());
    expect(ranking.ids).toEqual(['new', 'old']);
    expect(ranking.reasons).toEqual({ new: 'About Payments' });
  });
});

describe('archiveCandidates', () => {
  it('picks unread older than 60 days', () => {
    const items = [
      read('stale', NOW.getTime() - 61 * DAY),
      read('fresh', NOW.getTime() - 59 * DAY),
      read('done', NOW.getTime() - 90 * DAY, 'read'),
    ];
    expect(archiveCandidates(items, NOW)).toEqual(['stale']);
  });
});
