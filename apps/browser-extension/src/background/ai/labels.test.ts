import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkItemStatus, WorkSnapshot } from '../work/types';
import {
  INBOX_LABELS_CACHE,
  labelRows,
  mutedKeys,
  precomputeInboxLabels,
  readMutedKeys,
} from './labels';
import type { InboxLabel } from './settings';

const labels: InboxLabel[] = [
  { name: 'Mine', hint: 'things I own', mute: false },
  { name: 'Noise', hint: 'bots and chores', mute: true },
];

const row = (n: number) => ({
  key: `o/r#${n}`,
  title: `PR ${n}`,
  repo: 'o/r',
  reasons: ['assigned'],
});

type Schema = { properties: { rows: { items: { properties: { label: { enum: string[] } } } } } };

const fakeModel = (answer: (input: string) => unknown) => {
  const prompts: { input: string; schema: Schema }[] = [];
  const model = {
    availability: vi.fn(async () => 'available'),
    create: vi.fn(async () => ({
      prompt: async (input: string, options?: { responseConstraint?: Schema }) => {
        prompts.push({ input, schema: options?.responseConstraint as Schema });
        return JSON.stringify(answer(input));
      },
      destroy: () => {},
    })),
  };
  vi.stubGlobal('LanguageModel', model);
  return { model, prompts };
};

let store: Record<string, unknown>;
beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('labelRows', () => {
  it("labels only from the user's list", async () => {
    const { prompts } = fakeModel(() => ({
      rows: [
        { key: 'o/r#1', label: 'Noise' },
        { key: 'o/r#2', label: 'Invented' },
        { key: 'o/r#3', label: 'none' },
      ],
    }));
    const out = await labelRows([row(1), row(2), row(3)], labels);
    expect(out).toEqual({ 'o/r#1': 'Noise' });
    expect(prompts[0]?.schema.properties.rows.items.properties.label.enum).toEqual([
      'Mine',
      'Noise',
      'none',
    ]);
  });

  it('batches of 20 rows', async () => {
    const { model } = fakeModel(() => ({ rows: [] }));
    await labelRows(
      Array.from({ length: 45 }, (_, i) => row(i)),
      labels,
    );
    expect(model.create).toHaveBeenCalledTimes(3);
  });

  it('no labels when the list is empty, and no model call', async () => {
    const { model } = fakeModel(() => ({ rows: [] }));
    expect(await labelRows([row(1)], [])).toEqual({});
    expect(model.create).not.toHaveBeenCalled();
  });
});

describe('mutedKeys', () => {
  it('keeps only rows whose label is muted now', () => {
    const assigned = { a: 'Noise', b: 'Mine', c: 'Gone' };
    expect(mutedKeys(assigned, labels)).toEqual(new Set(['a']));
    expect(INBOX_LABELS_CACHE).toBe('inbox:labels');
  });
});

const status = (n: number): WorkItemStatus => ({
  key: `o/r#${n}` as never,
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
  updatedAt: '2026-10-14T09:00:00.000Z',
});

const snapshotOf = (count: number): WorkSnapshot =>
  ({
    login: 'me',
    fetchedAt: 1,
    searches: {
      'review-requested': [],
      assigned: Array.from({ length: count }, (_, i) => status(i + 1)),
      failing: [],
      'changes-requested': [],
      'ready-to-merge': [],
      mine: [],
    },
    threads: [],
    pinned: {},
    orgProblems: [],
    problem: null,
  }) as unknown as WorkSnapshot;

const withLabels = () => {
  store.aiSettings = { inboxLabels: labels };
};
const cachedLabels = () =>
  (store.aiCache as Record<string, { value: unknown }> | undefined)?.[INBOX_LABELS_CACHE]?.value;
const slots = () =>
  Object.keys((store.aiCache as Record<string, unknown> | undefined) ?? {}).filter((key) =>
    key.startsWith('inbox:label:'),
  );

describe('precomputeInboxLabels', () => {
  it('caches an all-none answer, so the next run asks nothing', async () => {
    withLabels();
    const { prompts } = fakeModel(() => ({ rows: [{ key: 'o/r#1', label: 'none' }] }));
    await precomputeInboxLabels(snapshotOf(2), null);
    expect(prompts).toHaveLength(1);
    expect(slots()).toHaveLength(2);
    expect(cachedLabels()).toEqual({});
    await precomputeInboxLabels(snapshotOf(2), null);
    expect(prompts).toHaveLength(1);
  });

  it('a cache hit makes no prompt and keeps the labels', async () => {
    withLabels();
    const { prompts } = fakeModel(() => ({ rows: [{ key: 'o/r#1', label: 'Noise' }] }));
    await precomputeInboxLabels(snapshotOf(1), null);
    await precomputeInboxLabels(snapshotOf(1), null);
    expect(prompts).toHaveLength(1);
    expect(cachedLabels()).toEqual({ 'o/r#1': 'Noise' });
  });

  it('a changed label hint asks again', async () => {
    withLabels();
    const { prompts } = fakeModel(() => ({ rows: [] }));
    await precomputeInboxLabels(snapshotOf(1), null);
    store.aiSettings = { inboxLabels: [{ ...labels[0], hint: 'other hint' }, labels[1]] };
    await precomputeInboxLabels(snapshotOf(1), null);
    expect(prompts).toHaveLength(2);
  });

  it('without the model nothing is labelled and nothing is cached for the rows', async () => {
    withLabels();
    await precomputeInboxLabels(snapshotOf(2), null);
    expect(cachedLabels()).toEqual({});
    expect(slots()).toEqual([]);
  });

  it('a batch the model failed to answer is retried, one it answered is not', async () => {
    withLabels();
    let calls = 0;
    // The second batch's answer is not JSON, which comes back as no answer.
    const model = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => (++calls === 2 ? 'not json' : JSON.stringify({ rows: [] })),
        destroy: () => {},
      }),
    };
    vi.stubGlobal('LanguageModel', model);
    await precomputeInboxLabels(snapshotOf(25), null);
    expect(slots()).toHaveLength(20);
  });
});

describe('readMutedKeys', () => {
  it('reads the muted keys from the cache', async () => {
    withLabels();
    store.aiCache = {
      [INBOX_LABELS_CACHE]: {
        value: { a: 'Noise', b: 'Mine' },
        at: Date.now(),
        ttl: 60_000,
      },
    };
    expect(await readMutedKeys()).toEqual(new Set(['a']));
  });

  it('is empty while the side panel AI is off, even with labels cached', async () => {
    store.aiSettings = { inboxLabels: labels, sidePanel: false };
    store.aiCache = {
      [INBOX_LABELS_CACHE]: { value: { a: 'Noise' }, at: Date.now(), ttl: 60_000 },
    };
    expect(await readMutedKeys()).toEqual(new Set());
  });

  it('is empty without a cache', async () => {
    withLabels();
    expect(await readMutedKeys()).toEqual(new Set());
  });
});
