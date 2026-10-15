import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayCache } from '../today';
import {
  type Intent,
  type IntentContext,
  intentContext,
  intentMessages,
  intentSchema,
  parseIntent,
  previewOf,
  validateIntent,
} from './intent';

const CTX: IntentContext = {
  today: '2026-10-15',
  todoFiles: ['work.todos.md', '.kh/inbox.todos.md'],
  eventFiles: ['.kh/dates.events.csv'],
  habits: [{ path: '.kh/run.habit.csv', name: 'run' }],
  timers: [
    { path: '.kh/payments.timetracking.csv', name: 'payments', running: false },
    { path: '.kh/writing.timetracking.csv', name: 'writing', running: true },
  ],
  streams: [{ id: 'st_1', name: 'Payments' }],
  bookmarks: [{ id: 'b1', title: 'Vitest guide' }],
};

let store: Record<string, unknown>;

/** A stand-in for Chrome's `LanguageModel`, answering `answer` to every prompt. */
const fakeModel = (answer: unknown) => {
  const prompts: { input: string; options?: { responseConstraint?: object } }[] = [];
  const model = {
    availability: vi.fn(async () => 'available'),
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

describe('intentSchema', () => {
  it('is a oneOf keyed by action, every choice an enum from the context', () => {
    const schema = intentSchema(CTX) as { oneOf: { properties: Record<string, any> }[] };
    const byAction = Object.fromEntries(
      schema.oneOf.map((branch) => [branch.properties.action.enum[0], branch.properties]),
    );
    expect(Object.keys(byAction).sort()).toEqual(
      [
        'add-event',
        'add-todo',
        'check-in',
        'log',
        'open-bookmark',
        'pin-to-stream',
        'read-later',
        'timer',
      ].sort(),
    );
    expect(byAction['add-todo'].path.enum).toEqual(CTX.todoFiles);
    expect(byAction['add-event'].path.enum).toEqual(CTX.eventFiles);
    expect(byAction['pin-to-stream'].streamId.enum).toEqual(['st_1']);
    expect(byAction['open-bookmark'].bookmarkId.enum).toEqual(['b1']);
    expect(byAction.timer.path.enum).toEqual(CTX.timers.map((t) => t.path));
    expect(byAction['check-in'].path.enum).toEqual(['.kh/run.habit.csv']);
  });

  it('leaves out the actions the context has nothing for', () => {
    const empty = { ...CTX, eventFiles: [], habits: [], timers: [], streams: [], bookmarks: [] };
    const schema = intentSchema(empty) as { oneOf: { properties: Record<string, any> }[] };
    expect(schema.oneOf.map((branch) => branch.properties.action.enum[0]).sort()).toEqual([
      'add-todo',
      'log',
      'read-later',
    ]);
  });
});

describe('validateIntent', () => {
  it('ids and paths only from the context', () => {
    expect(
      validateIntent({ action: 'add-todo', text: 'Call', path: 'evil.todos.md' }, CTX, 'Call'),
    ).toBeNull();
    expect(validateIntent({ action: 'pin-to-stream', streamId: 'st_9' }, CTX, 'x')).toBeNull();
    expect(validateIntent({ action: 'open-bookmark', bookmarkId: 'b9' }, CTX, 'x')).toBeNull();
    expect(validateIntent({ action: 'check-in', path: '.kh/x.habit.csv' }, CTX, 'x')).toBeNull();
    expect(
      validateIntent(
        {
          action: 'add-event',
          name: 'Dentist',
          startDate: '2026-10-20',
          endDate: '2026-10-20',
          path: 'other.events.csv',
        },
        CTX,
        'x',
      ),
    ).toBeNull();
    expect(validateIntent({ action: 'delete-repo' }, CTX, 'x')).toBeNull();
    expect(validateIntent({ action: 'pin-to-stream', streamId: 'st_1' }, CTX, 'x')).toEqual({
      action: 'pin-to-stream',
      streamId: 'st_1',
    });
  });

  it('refuses a timer stop for a timer that is not running', () => {
    const stop = (path: string) => ({ action: 'timer', path, toggle: 'stop' });
    expect(validateIntent(stop('.kh/payments.timetracking.csv'), CTX, 'x')).toBeNull();
    expect(validateIntent(stop('.kh/writing.timetracking.csv'), CTX, 'x')).toEqual(
      stop('.kh/writing.timetracking.csv'),
    );
    expect(
      validateIntent(
        { action: 'timer', path: '.kh/writing.timetracking.csv', toggle: 'start' },
        CTX,
        'x',
      ),
    ).toBeNull();
  });

  it('refuses an event date that is not real or far away', () => {
    const event = (startDate: string, endDate = startDate) => ({
      action: 'add-event',
      name: 'Dentist',
      startDate,
      endDate,
      path: '.kh/dates.events.csv',
    });
    expect(validateIntent(event('2026-02-30'), CTX, 'x')).toBeNull();
    expect(validateIntent(event('2029-01-01'), CTX, 'x')).toBeNull();
    expect(validateIntent(event('2026-10-20', '2026-10-19'), CTX, 'x')).toBeNull();
    expect(validateIntent(event('2026-10-20'), CTX, 'x')).toEqual(event('2026-10-20'));
  });

  it('keeps tag-shaped tags when checked again without the input', () => {
    expect(
      validateIntent({ action: 'log', description: '30m', tags: ['payments', 'no tags!'] }, CTX),
    ).toEqual({ action: 'log', description: '30m', tags: ['payments'] });
  });

  it("takes tags only from the user's own #tags", () => {
    expect(
      validateIntent(
        { action: 'log', description: '30m on payments #payments', tags: ['evil'] },
        CTX,
        'log 30m on payments #payments',
      ),
    ).toEqual({ action: 'log', description: '30m on payments', tags: ['payments'] });
  });
});

describe('parseIntent', () => {
  it("'log 30m on payments' becomes a log intent", async () => {
    const { prompts } = fakeModel({ action: 'log', description: '30m on payments' });
    expect(await parseIntent('log 30m on payments', CTX)).toEqual({
      action: 'log',
      description: '30m on payments',
      tags: [],
    });
    expect(prompts[0]?.options?.responseConstraint).toEqual(intentSchema(CTX));
    expect(prompts[0]?.input).toContain('log 30m on payments');
  });

  it('refuses an answer naming something the context does not have', async () => {
    fakeModel({ action: 'open-bookmark', bookmarkId: 'nope' });
    expect(await parseIntent('open the nope bookmark', CTX)).toBeNull();
  });

  it('is null without the model', async () => {
    expect(await parseIntent('log 30m on payments', CTX)).toBeNull();
  });

  it('is null when the palette switch is off', async () => {
    store.aiSettings = { palette: false };
    const { model } = fakeModel({ action: 'log', description: '30m on payments' });
    expect(await parseIntent('log 30m on payments', CTX)).toBeNull();
    expect(model.create).not.toHaveBeenCalled();
  });

  it('answers the same text from the cache', async () => {
    const { model } = fakeModel({ action: 'check-in', path: '.kh/run.habit.csv' });
    await parseIntent('check in my run', CTX);
    expect(await parseIntent('check in my run', CTX)).toEqual({
      action: 'check-in',
      path: '.kh/run.habit.csv',
    });
    expect(model.create).toHaveBeenCalledTimes(1);
  });
});

describe('previewOf', () => {
  it('previewOf names the target', () => {
    const cases: [Intent, string][] = [
      [
        { action: 'log', description: '30m on payments', tags: ['payments'] },
        'Log: 30m on payments #payments',
      ],
      [
        { action: 'add-todo', text: 'Call the bank', path: 'work.todos.md', tags: [] },
        'Todo: Call the bank → work.todos.md',
      ],
      [
        {
          action: 'add-event',
          name: 'Dentist',
          startDate: '2026-10-20',
          endDate: '2026-10-20',
          path: '.kh/dates.events.csv',
        },
        'Event: Dentist on 2026-10-20 → .kh/dates.events.csv',
      ],
      [{ action: 'pin-to-stream', streamId: 'st_1' }, 'Pin this page to Payments'],
      [{ action: 'read-later' }, 'Read later: this page'],
      [{ action: 'open-bookmark', bookmarkId: 'b1' }, 'Open Vitest guide'],
      [
        { action: 'timer', path: '.kh/writing.timetracking.csv', toggle: 'stop' },
        'Stop timer: writing',
      ],
      [{ action: 'check-in', path: '.kh/run.habit.csv' }, 'Check in: run'],
    ];
    for (const [intent, preview] of cases) expect(previewOf(intent, CTX)).toBe(preview);
  });
});

describe('intentContext', () => {
  it('lists the files, habits, timers, streams and the top bookmarks by frecency', () => {
    const cache: TodayCache = {
      repo: 'o/r',
      appFolder: '.kh',
      actionLogPaths: [],
      etag: null,
      fetchedAt: 0,
      files: [
        { path: 'work.todos.md', sha: 's1', content: '- [ ] Ship\n' },
        { path: '.kh/dates.events.csv', sha: 's2', content: 'name;type;start;end\n' },
        { path: '.kh/run.habit.csv', sha: 's3', content: '' },
        { path: '.kh/payments.timetracking.csv', sha: 's4', content: '' },
      ],
    };
    const now = new Date(2026, 9, 15, 10);
    const bookmark = (id: string, useCount: number) => ({
      id,
      title: id.toUpperCase(),
      url: `https://${id}.example`,
      tags: [],
      createdAt: '',
      updatedAt: '',
      useCount,
      lastUsedAt: useCount ? now.toISOString() : '',
      pinned: false,
    });
    const ctx = intentContext(
      cache,
      [{ id: 'st_1', name: 'Payments' }],
      [
        bookmark('a', 0),
        bookmark('b', 5),
        ...Array.from({ length: 60 }, (_, i) => bookmark(`z${i}`, 1)),
      ],
      now,
    );
    expect(ctx.today).toBe('2026-10-15');
    expect(ctx.todoFiles).toEqual(['work.todos.md', '.kh/inbox.todos.md']);
    expect(ctx.eventFiles).toEqual(['.kh/dates.events.csv']);
    expect(ctx.habits).toEqual([{ path: '.kh/run.habit.csv', name: 'run' }]);
    expect(ctx.timers).toEqual([
      { path: '.kh/payments.timetracking.csv', name: 'payments', running: false },
    ]);
    expect(ctx.streams).toEqual([{ id: 'st_1', name: 'Payments' }]);
    expect(ctx.bookmarks).toHaveLength(50);
    expect(ctx.bookmarks[0]).toEqual({ id: 'b', title: 'B' });
    expect(ctx.bookmarks.some((b) => b.id === 'a')).toBe(false);
  });
});

describe('intentMessages', () => {
  const page = { url: 'https://example.com/a', title: 'A page', text: 'Body' };

  it('turns each intent into the message its existing handler takes', () => {
    expect(
      intentMessages(
        { action: 'add-todo', text: 'Call', path: 'work.todos.md', tags: ['bank'] },
        { page, logPath: 'x.actionlog.md' },
      ),
    ).toEqual([{ type: 'ADD_TODO', text: 'Call', path: 'work.todos.md', tags: ['bank'] }]);
    expect(
      intentMessages(
        { action: 'log', description: '30m', tags: [] },
        { page, logPath: 'x.actionlog.md' },
      ),
    ).toEqual([{ type: 'ADD_ACTION_LOG', path: 'x.actionlog.md', description: '30m', tags: [] }]);
    expect(intentMessages({ action: 'read-later' }, { page, logPath: 'x.actionlog.md' })).toEqual([
      { type: 'READ_LATER_ADD', url: page.url, title: page.title, text: 'Body' },
    ]);
    expect(
      intentMessages(
        { action: 'open-bookmark', bookmarkId: 'b1' },
        { page, logPath: 'x.actionlog.md', bookmarkUrl: 'https://vitest.dev', reuse: true },
      ),
    ).toEqual([
      { type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' },
      { type: 'OPEN_URL', url: 'https://vitest.dev', reuse: true },
    ]);
    const [pin] = intentMessages(
      { action: 'pin-to-stream', streamId: 'st_1' },
      { page, logPath: 'x.actionlog.md' },
    ) as { type: string; ops: Record<string, unknown>[] }[];
    expect(pin?.type).toBe('WORK_OPS');
    expect(pin?.ops[0]).toMatchObject({
      op: 'pin',
      streamId: 'st_1',
      url: page.url,
      title: page.title,
      labels: [],
    });
  });
});
