import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { precomputeTldrs, readTldrs, summarizeWaiting, tldrKey, waitingRows } from './tldr';

let store: Record<string, unknown>;
let summarizer: { summarize: ReturnType<typeof vi.fn>; destroy: () => void };
let create: ReturnType<typeof vi.fn>;

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
  summarizer = { summarize: vi.fn(async () => ' Adds retries.\nMore. '), destroy: () => {} };
  create = vi.fn(async () => summarizer);
  vi.stubGlobal('Summarizer', { availability: async () => 'available', create });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const row = (n: number, over: Record<string, unknown> = {}) => ({
  key: `acme/web#${n}`,
  updatedAt: `2026-10-14T09:0${n}:00Z`,
  title: `PR ${n}`,
  body: `Body ${n}`,
  ...over,
});

describe('summarizeWaiting', () => {
  it('skips rows without body and reuses the cache for an unchanged updatedAt', async () => {
    const rows = [row(1), row(2, { body: undefined })];
    expect(await summarizeWaiting(rows)).toEqual({ 'acme/web#1': 'Adds retries.' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'tldr', length: 'short' }));
    expect(summarizer.summarize).toHaveBeenCalledTimes(1);

    expect(await summarizeWaiting(rows)).toEqual({ 'acme/web#1': 'Adds retries.' });
    expect(summarizer.summarize).toHaveBeenCalledTimes(1);

    // A newer update is a new item as far as the summary goes.
    await summarizeWaiting([row(1, { updatedAt: '2026-10-15T00:00:00Z' })]);
    expect(summarizer.summarize).toHaveBeenCalledTimes(2);
  });

  it('remembers a failed summary for a while instead of asking on every run', async () => {
    summarizer.summarize.mockResolvedValue('');
    expect(await summarizeWaiting([row(1)])).toEqual({});
    expect(await summarizeWaiting([row(1)])).toEqual({});
    expect(summarizer.summarize).toHaveBeenCalledTimes(1);
  });

  it('leaves a row out while the model is missing', async () => {
    vi.stubGlobal('Summarizer', undefined);
    expect(await summarizeWaiting([row(1)])).toEqual({});
  });
});

describe('the job and the read', () => {
  const item = (n: number, body?: string) => ({
    key: `acme/web#${n}`,
    updatedAt: `2026-10-14T09:0${n}:00Z`,
    title: `PR ${n}`,
    ...(body ? { body } : {}),
  });
  const snapshot = () => ({
    searches: {
      'review-requested': [item(1, 'one')],
      assigned: [item(1, 'one'), item(2, 'two')],
      failing: [],
      'changes-requested': [],
      'ready-to-merge': [],
      mine: [item(9, 'mine')],
    },
  });

  it('collects each waiting item once and never the user own PRs', () => {
    store.workSnapshot = snapshot();
    expect(waitingRows(store.workSnapshot as never).map((r) => r.key)).toEqual([
      'acme/web#2',
      'acme/web#1',
    ]);
  });

  it('writes summaries, which the read then serves without the model', async () => {
    store.workSnapshot = snapshot();
    await precomputeTldrs();
    summarizer.summarize.mockClear();
    expect(await readTldrs()).toEqual({
      'acme/web#1': 'Adds retries.',
      'acme/web#2': 'Adds retries.',
    });
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(tldrKey(item(1))).toBe('tldr:acme/web#1@2026-10-14T09:01:00Z');
  });

  it('serves no cached summary while the side panel AI is off', async () => {
    store.workSnapshot = snapshot();
    await precomputeTldrs();
    store.aiSettings = { sidePanel: false };
    expect(await readTldrs()).toEqual({});
  });

  it('does nothing when the side panel AI is off', async () => {
    store.workSnapshot = snapshot();
    store.aiSettings = { sidePanel: false };
    await precomputeTldrs();
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });
});
