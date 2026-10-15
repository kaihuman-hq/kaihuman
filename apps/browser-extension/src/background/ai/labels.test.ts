import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INBOX_LABELS_CACHE, labelRows, mutedKeys } from './labels';
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

beforeEach(() => {
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}), set: async () => {} } } });
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
