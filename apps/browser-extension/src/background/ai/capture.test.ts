import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayCache } from '../today';
import { type CaptureContext, captureContext, captureSchema, classifyCapture } from './capture';

// A Thursday, in local time like the rest of the start page.
const NOW = new Date(2026, 9, 15, 10, 0, 0);

const cache = (): TodayCache => ({
  repo: 'o/r',
  appFolder: '.kh',
  actionLogPaths: [],
  etag: null,
  fetchedAt: 0,
  files: [
    {
      path: 'work.todos.md',
      sha: 's1',
      content:
        '---\nmilestones:\n  - id: q4\n    name: Q4 launch\n---\n\n- [ ] Call the bank #bank\n- [ ] Ship #work !q4\n',
    },
    {
      path: '.kh/dates.events.csv',
      sha: 's2',
      content: 'name;type;start;end\nX;general;2026-01-01;2026-01-01',
    },
    { path: '.kh/health.habit.csv', sha: 's3', content: '' },
  ],
});

let store: Record<string, unknown>;

/** A stand-in for Chrome's `LanguageModel`, answering `answer` to every prompt. */
const fakeModel = (answer: unknown) => {
  const prompts: { input: string; options?: { responseConstraint?: object } }[] = [];
  const created: {
    initialPrompts?: { content: string }[];
    expectedInputs?: { languages: string[] }[];
  }[] = [];
  const model = {
    availability: vi.fn(async () => 'available'),
    create: vi.fn(async (options: (typeof created)[number] = {}) => {
      created.push(options);
      return {
        prompt: async (input: string, options?: { responseConstraint?: object }) => {
          prompts.push({ input, options });
          return JSON.stringify(answer);
        },
        destroy: () => {},
      };
    }),
  };
  vi.stubGlobal('LanguageModel', model);
  return { model, prompts, created };
};

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

describe('captureContext', () => {
  it('lists the todo files with their milestones, the inbox, the event files and the tags', () => {
    expect(captureContext(cache(), NOW)).toEqual({
      today: '2026-10-15',
      todoFiles: [
        { path: 'work.todos.md', milestones: [{ id: 'q4', name: 'Q4 launch' }] },
        { path: '.kh/inbox.todos.md', milestones: [] },
      ],
      eventFiles: ['.kh/dates.events.csv'],
      tags: ['bank', 'work'],
    });
  });
});

describe('classifyCapture', () => {
  const ctx = (): CaptureContext => captureContext(cache(), NOW);

  it('schema limits path and milestone to known files', () => {
    const schema = captureSchema(ctx()) as {
      properties: {
        guesses: {
          maxItems: number;
          items: {
            properties: {
              kind: { enum: string[] };
              path: { enum: string[] };
              milestoneId: { enum: string[] };
              tags: { items: { enum: string[] } };
            };
          };
        };
      };
    };
    const item = schema.properties.guesses.items.properties;
    expect(schema.properties.guesses.maxItems).toBe(3);
    expect(item.path.enum).toEqual(['work.todos.md', '.kh/inbox.todos.md', '.kh/dates.events.csv']);
    expect(item.milestoneId.enum).toEqual(['q4']);
    expect(item.tags.items.enum).toEqual(['bank', 'work']);
    expect(item.kind.enum).toEqual(['note', 'todo', 'log', 'event']);
  });

  it('sends the schema and the date, and keeps the tags typed in the text', async () => {
    const { prompts, created } = fakeModel({
      guesses: [
        {
          kind: 'todo',
          text: 'Call the bank',
          tags: ['bank'],
          path: 'work.todos.md',
          milestoneId: 'q4',
        },
        { kind: 'note', text: 'whatever' },
      ],
    });
    const guesses = await classifyCapture('Call the bank #urgent', ctx());
    expect(guesses).toEqual([
      {
        kind: 'todo',
        text: 'Call the bank',
        tags: ['bank', 'urgent'],
        path: 'work.todos.md',
        milestoneId: 'q4',
      },
      { kind: 'note', text: 'Call the bank #urgent' },
    ]);
    expect(prompts[0]?.options?.responseConstraint).toEqual(captureSchema(ctx()));
    expect(created[0]?.initialPrompts?.[0]?.content).toContain('Thursday, 2026-10-15');
    expect(prompts[0]?.input).toContain('Call the bank #urgent');
  });

  it('refuses unknown paths and invalid dates', async () => {
    fakeModel({
      guesses: [
        { kind: 'todo', text: 'x', tags: [], path: 'secret.todos.md' },
        { kind: 'todo', text: 'x', tags: [], path: '.kh/inbox.todos.md', milestoneId: 'nope' },
        {
          kind: 'event',
          text: 'x',
          type: 'general',
          startDate: '2026-02-30',
          path: '.kh/dates.events.csv',
        },
        {
          kind: 'event',
          text: 'x',
          type: 'general',
          startDate: '2029-01-01',
          path: '.kh/dates.events.csv',
        },
        {
          kind: 'event',
          text: 'x',
          type: 'general',
          startDate: '2026-10-16',
          path: 'work.todos.md',
        },
        { kind: 'spam', text: 'x' },
      ],
    });
    expect(await classifyCapture('something', ctx())).toEqual([]);
  });

  it("resolves 'Lunch with Anna Fri 12' to an event on the coming Friday", async () => {
    fakeModel({
      guesses: [
        {
          kind: 'event',
          text: 'Lunch with Anna',
          type: 'general',
          startDate: '2026-10-16',
          path: '.kh/dates.events.csv',
        },
      ],
    });
    expect(await classifyCapture('Lunch with Anna Fri 12', ctx())).toEqual([
      {
        kind: 'event',
        name: 'Lunch with Anna',
        type: 'general',
        startDate: '2026-10-16',
        endDate: '2026-10-16',
        path: '.kh/dates.events.csv',
      },
    ]);
  });

  it('German text declares de', async () => {
    const { created } = fakeModel({ guesses: [{ kind: 'note', text: 'x' }] });
    vi.stubGlobal('LanguageDetector', {
      availability: async () => 'available',
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'de', confidence: 0.9 }],
        destroy: () => {},
      }),
    });
    await classifyCapture('Morgen Zahnarzt anrufen', ctx());
    expect(created[0]?.expectedInputs?.[0]?.languages).toEqual(['en', 'de']);
  });

  it('returns [] without the model, or with enrichment switched off', async () => {
    expect(await classifyCapture('Call the bank', ctx())).toEqual([]);
    const { model } = fakeModel({ guesses: [{ kind: 'note', text: 'x' }] });
    store.aiSettings = { enrichment: false };
    expect(await classifyCapture('Call the bank', ctx())).toEqual([]);
    expect(model.create).not.toHaveBeenCalled();
  });

  it('answers the same text from the cache', async () => {
    const { model } = fakeModel({ guesses: [{ kind: 'log', text: 'Shipped', tags: ['work'] }] });
    const first = await classifyCapture('Shipped it', ctx());
    expect(first).toEqual([{ kind: 'log', description: 'Shipped it', tags: ['work'] }]);
    expect(await classifyCapture('Shipped it', ctx())).toEqual(first);
    expect(model.create).toHaveBeenCalledTimes(1);
  });
});
