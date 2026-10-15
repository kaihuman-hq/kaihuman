import type { StreamsFile } from '@kaihuman/formats';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadModel,
  modelAvailability,
  NEW_STREAM,
  parseModelAnswer,
  promptFor,
  ruleSuggestion,
  schemaFor,
  suggestionOps,
  suggestStream,
} from './suggest';

const NOW = '2026-10-15T10:00:00.000Z';
const item = (id: string, url: string, title: string, extra: Record<string, unknown> = {}) => ({
  id: id as never,
  url,
  title,
  addedAt: NOW,
  labels: [] as string[],
  extra: {},
  ...extra,
});
const stream = (id: string, name: string, items: ReturnType<typeof item>[]) => ({
  id: id as never,
  name,
  createdAt: NOW,
  invalidItems: [],
  extra: {},
  items,
});
const file = (): StreamsFile => ({
  version: 1,
  updatedAt: NOW,
  invalidStreams: [],
  extra: {},
  streams: [
    stream('st_pay', 'Payments', [
      item('it_1', 'https://github.com/acme/payments/pull/1', 'Ledger backfill', {
        labels: ['backend', 'urgent'],
      }),
      item('it_2', 'https://github.com/acme/payments/issues/2', 'Rounding bug', {
        labels: ['backend'],
      }),
    ]),
    stream('st_web', 'Website', [
      item('it_3', 'https://github.com/acme/web/pull/3', 'New header'),
      item('it_4', 'https://github.com/acme/payments/pull/4', 'Checkout copy'),
      item('it_5', 'https://github.com/acme/web/pull/5', 'Old', { doneAt: NOW }),
    ]),
  ],
});

/** A stand-in for Chrome's `LanguageModel`, answering `answer` to every prompt. */
const fakeModel = (answer: string, availability = 'available') => {
  const prompts: { input: string; options?: { responseConstraint?: object } }[] = [];
  const destroyed: number[] = [];
  const created: object[] = [];
  const model = {
    availability: vi.fn(async () => availability),
    create: vi.fn(async (options: object = {}) => {
      created.push(options);
      return {
        prompt: async (input: string, options?: { responseConstraint?: object }) => {
          prompts.push({ input, options });
          return answer;
        },
        destroy: () => destroyed.push(1),
      };
    }),
  };
  vi.stubGlobal('LanguageModel', model);
  return { model, prompts, destroyed, created };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ruleSuggestion', () => {
  it('picks the stream that holds most of the repository', () => {
    expect(
      ruleSuggestion(file(), { url: 'https://github.com/acme/payments/pull/9', title: 'X' }),
    ).toEqual({
      stream: { kind: 'existing', id: 'st_pay' },
      labels: [],
      source: 'rules',
      reason: 'Most items from acme/payments are here',
    });
  });

  it('stays out of a tie, an unknown repository and non-GitHub pages', () => {
    const tied = file();
    tied.streams[1]?.items.push(item('it_6', 'https://github.com/acme/payments/pull/6', 'More'));
    expect(
      ruleSuggestion(tied, { url: 'https://github.com/acme/payments/pull/9', title: 'X' }),
    ).toBeNull();
    expect(
      ruleSuggestion(file(), { url: 'https://github.com/acme/api/pull/1', title: 'X' }),
    ).toBeNull();
    expect(
      ruleSuggestion(file(), { url: 'https://acme.slack.com/archives/C1/p1', title: 'X' }),
    ).toBeNull();
  });
});

describe('promptFor and schemaFor', () => {
  it('lists the streams with their open items, the labels in use and the hint', () => {
    const prompt = promptFor(file(), {
      url: 'https://github.com/acme/payments/pull/9',
      title: 'Refund idempotency',
    });
    expect(prompt).toContain('Stream "Payments"');
    expect(prompt).toContain('Ledger backfill (pull request acme/payments#1)');
    expect(prompt).not.toContain('Old (');
    expect(prompt).toContain('Labels in use: backend, urgent');
    expect(prompt).toContain('Most items from the same repository are in "Payments".');
    expect(prompt).toContain('Item to file: Refund idempotency (pull request acme/payments#9)');
  });

  it('cuts long titles so one item cannot fill the context', () => {
    const prompt = promptFor(file(), { url: 'https://example.com/a', title: 'x'.repeat(1000) });
    expect(prompt.length).toBeLessThan(1000);
    expect(prompt).toContain('(example.com)');
  });

  it('only allows the streams shown, or a new one', () => {
    const schema = schemaFor(file()) as {
      properties: { stream: { enum: string[] }; labels: { maxItems: number } };
    };
    expect(schema.properties.stream.enum).toEqual(['Payments', 'Website', NEW_STREAM]);
    expect(schema.properties.labels.maxItems).toBe(3);
  });
});

describe('parseModelAnswer', () => {
  it('maps a stream name to its id and tidies the labels', () => {
    expect(
      parseModelAnswer(
        JSON.stringify({
          stream: 'Website',
          labels: [' Frontend ', 'frontend', '', 'ui', 'a', 'b'],
        }),
        file(),
      ),
    ).toEqual({
      stream: { kind: 'existing', id: 'st_web' },
      labels: ['frontend', 'ui', 'a'],
      source: 'model',
    });
  });

  it('keeps a reason of 80 characters or fewer and drops a longer one', () => {
    const answer = (reason: string) =>
      parseModelAnswer(JSON.stringify({ stream: 'Website', labels: [], reason }), file());
    expect(answer('x'.repeat(80))?.reason).toBe('x'.repeat(80));
    expect(answer('x'.repeat(81))?.reason).toBeUndefined();
    expect(answer('x'.repeat(81))?.stream).toEqual({ kind: 'existing', id: 'st_web' });
  });

  it('turns a named new stream into one, unless the name already exists', () => {
    expect(
      parseModelAnswer(
        JSON.stringify({ stream: NEW_STREAM, newStreamName: ' Hiring ', labels: [] }),
        file(),
      )?.stream,
    ).toEqual({ kind: 'new', name: 'Hiring' });
    expect(
      parseModelAnswer(
        JSON.stringify({ stream: NEW_STREAM, newStreamName: 'payments', labels: [] }),
        file(),
      )?.stream,
    ).toEqual({ kind: 'existing', id: 'st_pay' });
  });

  it('refuses what is not a usable answer', () => {
    expect(parseModelAnswer('not json', file())).toBeNull();
    expect(parseModelAnswer('null', file())).toBeNull();
    expect(parseModelAnswer(JSON.stringify({ stream: 'Nope', labels: [] }), file())).toBeNull();
    expect(
      parseModelAnswer(
        JSON.stringify({ stream: NEW_STREAM, newStreamName: ' ', labels: [] }),
        file(),
      ),
    ).toBeNull();
  });
});

describe('suggestionOps', () => {
  it('creates a new stream before pinning into it', () => {
    const { streamId, ops } = suggestionOps(
      { stream: { kind: 'new', name: 'Hiring' }, labels: ['people'], source: 'model' },
      { url: 'https://example.com/job', title: 'Job ad' },
      NOW,
    );
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ op: 'addStream', streamId, name: 'Hiring' });
    expect(ops[1]).toMatchObject({
      op: 'pin',
      streamId,
      url: 'https://example.com/job',
      title: 'Job ad',
      labels: ['people'],
    });
  });

  it('pins straight into an existing stream', () => {
    const { streamId, ops } = suggestionOps(
      { stream: { kind: 'existing', id: 'st_web' as never }, labels: [], source: 'rules' },
      { url: 'https://example.com/a', title: '' },
      NOW,
    );
    expect(streamId).toBe('st_web');
    expect(ops).toEqual([expect.objectContaining({ op: 'pin', title: 'https://example.com/a' })]);
  });
});

describe('suggestStream', () => {
  const candidate = { url: 'https://github.com/acme/payments/pull/9', title: 'Refunds' };

  it('asks the model with the schema, in a fresh session it closes again', async () => {
    const { prompts, destroyed, created } = fakeModel(
      JSON.stringify({ stream: 'Website', labels: ['ui'] }),
    );
    const suggestion = await suggestStream(file(), candidate);
    expect(suggestion).toEqual({
      stream: { kind: 'existing', id: 'st_web' },
      labels: ['ui'],
      source: 'model',
    });
    expect(prompts[0]?.options?.responseConstraint).toEqual(schemaFor(file()));
    expect(created[0]).toMatchObject({ initialPrompts: [{ role: 'system' }] });
    expect(destroyed).toHaveLength(1);
  });

  it('falls back to the repository rule without a usable model', async () => {
    const rule = {
      stream: { kind: 'existing', id: 'st_pay' },
      labels: [],
      source: 'rules',
      reason: 'Most items from acme/payments are here',
    };
    expect(await suggestStream(file(), candidate)).toEqual(rule);
    fakeModel('{}', 'downloadable');
    expect(await suggestStream(file(), candidate)).toEqual(rule);
    fakeModel('garbage');
    expect(await suggestStream(file(), candidate)).toEqual(rule);
    const { model } = fakeModel('');
    model.create.mockRejectedValueOnce(new Error('out of memory'));
    expect(await suggestStream(file(), candidate)).toEqual(rule);
  });
});

describe('modelAvailability and downloadModel', () => {
  it('reports a Chrome without the API as unavailable', async () => {
    expect(await modelAvailability()).toBe('unavailable');
    await expect(downloadModel(() => {})).rejects.toThrow('no built-in model');
  });

  it('reports download progress', async () => {
    const progress: number[] = [];
    const model = {
      availability: async () => 'downloadable',
      create: async (options: {
        monitor?: (m: {
          addEventListener: (t: string, l: (e: { loaded: number }) => void) => void;
        }) => void;
      }) => {
        options.monitor?.({
          addEventListener: (_type, listener) => {
            listener({ loaded: 0.5 });
            listener({ loaded: 1 });
          },
        });
        return { prompt: async () => '', destroy: () => {} };
      },
    };
    vi.stubGlobal('LanguageModel', model);
    expect(await modelAvailability()).toBe('downloadable');
    await downloadModel((fraction) => progress.push(fraction));
    expect(progress).toEqual([0.5, 1]);
  });
});
