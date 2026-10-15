import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayCache } from '../today';
import { digestBraindumps, digestSchema, digestToday, parseDigest } from './digest';

let store: Record<string, unknown>;

const fakeModel = (answer: unknown, availability = 'available') => {
  const prompts: { input: string; options?: { responseConstraint?: object } }[] = [];
  const model = {
    availability: vi.fn(async () => availability),
    create: vi.fn(async () => ({
      prompt: async (input: string, options?: { responseConstraint?: object }) => {
        prompts.push({ input, options });
        return JSON.stringify(answer);
      },
      destroy: () => {},
    })),
  };
  vi.stubGlobal('LanguageModel', model);
  return { model, prompts };
};

const dump = (n: number) => ({ id: `d${n}`, title: `Dump ${n}`, text: `Thought ${n}` });

beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('digestBraindumps', () => {
  it('themes reference only given ids', async () => {
    const { prompts } = fakeModel({
      themes: [
        { title: 'Bank', ids: ['d1', 'ghost', 'd2'], todo: 'Call the bank' },
        { title: 'Phantom', ids: ['ghost'], todo: 'Nothing' },
      ],
    });
    const themes = await digestBraindumps([dump(1), dump(2), dump(3)]);
    expect(themes).toEqual([{ title: 'Bank', ids: ['d1', 'd2'], todo: 'Call the bank' }]);
    expect(prompts[0]?.options?.responseConstraint).toEqual(digestSchema(['d1', 'd2', 'd3']));
  });

  it('caps input at 30 braindumps and themes at 5', async () => {
    const { prompts } = fakeModel({
      themes: Array.from({ length: 7 }, (_, i) => ({ title: `T${i}`, ids: ['d0'], todo: 'x' })),
    });
    const themes = await digestBraindumps(Array.from({ length: 40 }, (_, i) => dump(i)));
    expect(themes).toHaveLength(5);
    expect(prompts[0]?.input).toContain('id: d29');
    expect(prompts[0]?.input).not.toContain('id: d30');
  });

  it('is null without the model, and for an answer with no usable theme', async () => {
    expect(await digestBraindumps([dump(1)])).toBeNull();
    fakeModel({ themes: [{ title: 'X', ids: ['nope'], todo: 'y' }] });
    expect(await digestBraindumps([dump(1)])).toBeNull();
    expect(parseDigest({ themes: 'no' }, new Set(['d1']))).toBeNull();
  });
});

describe('digestToday', () => {
  const cache = (): TodayCache => ({
    repo: 'o/r',
    appFolder: '.kh',
    actionLogPaths: [],
    etag: null,
    fetchedAt: 0,
    files: [{ path: '.kh/braindumps/1.md', sha: 's1', content: 'Call the bank\nabout the card' }],
  });

  it('answers a repeat from the cache, and not when switched off', async () => {
    const { model } = fakeModel({
      themes: [{ title: 'Bank', ids: ['.kh/braindumps/1.md'], todo: 'Call the bank' }],
    });
    const first = await digestToday(cache());
    expect(first).toEqual([{ title: 'Bank', ids: ['.kh/braindumps/1.md'], todo: 'Call the bank' }]);
    expect(await digestToday(cache())).toEqual(first);
    expect(model.create).toHaveBeenCalledTimes(1);

    store = { aiSettings: { newTab: false } };
    expect(await digestToday(cache())).toBeNull();
  });
});
