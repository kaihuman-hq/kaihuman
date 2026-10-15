import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Candidate, relatedTo } from './grow';

const stream = {
  name: 'Payments',
  titles: ['Ledger backfill'],
  repos: ['acme/payments'],
  hosts: ['docs.example.com'],
};
const candidate = (id: string, url: string): Candidate => ({ id, title: `Title ${id}`, url });

let settings: Record<string, unknown> = {};

/** A stand-in for Chrome's `LanguageModel`, answering `answer` to every prompt. */
const fakeModel = (answer: unknown) => {
  const prompts: string[] = [];
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async () => ({
      prompt: async (input: string) => {
        prompts.push(input);
        return JSON.stringify(answer);
      },
      destroy: () => {},
    }),
  });
  return prompts;
};

beforeEach(() => {
  settings = {};
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => settings } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('relatedTo', () => {
  it('returns only candidate ids, at most 8', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      candidate(`c${i}`, `https://example.com/${i}`),
    );
    // "99" was never shown; the model may still say it.
    fakeModel({ related: ['2', '99', '1', '1', '3', '4', '5', '6', '7', '8', '9', '10'] });
    const ids = await relatedTo(stream, many);
    expect(ids).toEqual(['c1', 'c0', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    expect(ids.length).toBeLessThanOrEqual(8);
  });

  it('rule fallback matches repo and host', async () => {
    // No model at all: the rules answer.
    const ids = await relatedTo(stream, [
      candidate('a', 'https://github.com/acme/payments/pull/9'),
      candidate('b', 'https://github.com/acme/web/pull/1'),
      candidate('c', 'https://docs.example.com/page'),
      candidate('d', 'https://other.example.org/'),
    ]);
    expect(ids).toEqual(['a', 'c']);
  });

  it('uses only the rules when the side panel model is switched off', async () => {
    settings = { aiSettings: { sidePanel: false } };
    const prompts = fakeModel({ related: ['2'] });
    const ids = await relatedTo(stream, [
      candidate('a', 'https://github.com/acme/payments/pull/9'),
      candidate('b', 'https://other.example.org/'),
    ]);
    expect(ids).toEqual(['a']);
    expect(prompts).toEqual([]);
  });

  it('falls back to the rules when the answer is not usable', async () => {
    fakeModel({ nope: true });
    const ids = await relatedTo(stream, [candidate('a', 'https://docs.example.com/x')]);
    expect(ids).toEqual(['a']);
  });

  it('sends a schema that allows only the numbers shown', async () => {
    const constraints: object[] = [];
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (_input: string, options: { responseConstraint: object }) => {
          constraints.push(options.responseConstraint);
          return JSON.stringify({ related: ['1'] });
        },
        destroy: () => {},
      }),
    });
    await relatedTo(stream, [
      candidate('a', 'https://a.example/'),
      candidate('b', 'https://b.example/'),
    ]);
    expect(constraints).toEqual([
      {
        type: 'object',
        properties: {
          related: { type: 'array', items: { type: 'string', enum: ['1', '2'] }, maxItems: 8 },
        },
        required: ['related'],
      },
    ]);
  });

  it('falls back to the rules when the model hangs past 8 s', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('LanguageModel', {
        availability: async () => 'available',
        create: async () => ({ prompt: () => new Promise(() => {}), destroy: () => {} }),
      });
      const asked = relatedTo(stream, [candidate('a', 'https://docs.example.com/x')]);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await asked).toEqual(['a']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns nothing without candidates', async () => {
    expect(await relatedTo(stream, [])).toEqual([]);
  });
});
