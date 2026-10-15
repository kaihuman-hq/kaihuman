import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusLine, morningBrief, precomputeBrief, precomputeFocus, readAiCards } from './brief.js';
import type { WorkContext } from './context.js';

let store: Record<string, unknown>;
let answers: string[];
let prompts: { input: string; constraint: unknown }[];

const ctx: WorkContext = {
  streams: [],
  todos: ['Ship the report'],
  todoTags: [],
  eventsToday: ['Standup'],
  waiting: [],
  redCi: [],
  openIdeas: [],
};

/** Worker inputs with one task in progress, so there is something to talk about. */
const inputs = async () =>
  ({
    today: { events: [], inProgress: [{ text: 'Ship the report' }], overdue: [], resurface: [] },
    todayCache: { files: [] },
    streams: null,
    snapshot: undefined,
  }) as never;

const session = {
  prompt: async (input: string, options?: { responseConstraint?: unknown }) => {
    prompts.push({ input, constraint: options?.responseConstraint });
    return answers.shift() ?? '{}';
  },
  destroy: () => {},
};

const stubModel = () =>
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async () => session,
  });

beforeEach(() => {
  store = {};
  answers = [];
  prompts = [];
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
  stubModel();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sentences = ['One.', 'Two.', 'Three.'];

describe('brief', () => {
  it('is generated once per date after 05:00', async () => {
    answers = [JSON.stringify({ sentences }), JSON.stringify({ sentences })];

    await precomputeBrief(inputs, new Date(2026, 9, 15, 4, 30));
    expect(prompts).toHaveLength(0);

    await precomputeBrief(inputs, new Date(2026, 9, 15, 6, 0));
    await precomputeBrief(inputs, new Date(2026, 9, 15, 9, 0));
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.constraint).toMatchObject({
      properties: { sentences: { minItems: 3, maxItems: 3, items: { maxLength: 160 } } },
    });
    expect(await readAiCards(new Date(2026, 9, 15, 9, 0))).toMatchObject({
      brief: sentences,
      briefDate: '2026-10-15',
    });
    // Another day: yesterday's brief is not served as today's.
    expect(await readAiCards(new Date(2026, 9, 16, 9, 0))).toEqual({});
  });

  it('is refused unless it is three non-empty sentences within 160 characters', async () => {
    answers = [
      JSON.stringify({ sentences: ['a', 'b'] }),
      JSON.stringify({ sentences: ['a', '', 'c'] }),
      JSON.stringify({ sentences: ['a', 'b', 'x'.repeat(161)] }),
    ];
    expect(await morningBrief(ctx)).toBeNull();
    expect(await morningBrief(ctx)).toBeNull();
    expect(await morningBrief(ctx)).toBeNull();
  });

  it('gives nothing without the model or without any work to talk about', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    expect(await morningBrief(ctx)).toBeNull();
    expect(await focusLine(ctx)).toBeNull();
    stubModel();
    expect(await focusLine({ ...ctx, todos: [], eventsToday: [] })).toBeNull();
    expect(prompts).toHaveLength(0);
  });
});

describe('focus', () => {
  it('is accepted within 120 characters', async () => {
    answers = [JSON.stringify({ focus: ' Finish the report ' })];
    expect(await focusLine(ctx)).toBe('Finish the report');
    expect(prompts[0]?.constraint).toMatchObject({ properties: { focus: { maxLength: 120 } } });
  });

  it('is refused when empty or over 120 characters', async () => {
    answers = [
      JSON.stringify({ focus: '  ' }),
      JSON.stringify({ focus: 'x'.repeat(121) }),
      JSON.stringify({ other: 1 }),
    ];
    expect(await focusLine(ctx)).toBeNull();
    expect(await focusLine(ctx)).toBeNull();
    expect(await focusLine(ctx)).toBeNull();
  });

  it('is computed once an hour and served from the cache', async () => {
    answers = [JSON.stringify({ focus: 'Finish the report' })];
    await precomputeFocus(inputs);
    await precomputeFocus(inputs);
    expect(prompts).toHaveLength(1);
    expect(await readAiCards()).toEqual({ focus: 'Finish the report' });
  });
});

describe('a refused answer', () => {
  it('is not asked for again within 15 minutes, focus or brief', async () => {
    answers = [JSON.stringify({ focus: '' }), JSON.stringify({ sentences: ['a'] })];
    const at = new Date(2026, 9, 15, 9, 0);
    await precomputeFocus(inputs);
    await precomputeFocus(inputs);
    await precomputeBrief(inputs, at);
    await precomputeBrief(inputs, at);
    expect(prompts).toHaveLength(2);
    expect(await readAiCards(at)).toEqual({});

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 16 * 60_000);
      answers = [JSON.stringify({ focus: 'Finish the report' })];
      await precomputeFocus(inputs);
      expect(prompts).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
