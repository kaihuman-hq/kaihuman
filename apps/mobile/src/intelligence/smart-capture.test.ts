import { describe, expect, it } from 'vitest';
import { nativeModel } from './model.js';
import { drainQueue, parseQueue, SMART_CAPTURE_QUEUE_FILE, toRaw } from './queue.js';
import { findHabit, saveCapture } from './save-capture.js';
import {
  CAPTURE_SCHEMA,
  captureInstructions,
  describeCapture,
  parseCapture,
  plainCapture,
  type SmartCapture,
  toCapture,
} from './smart-capture.js';
import { controllerFor, fakeModel, memFiles } from './test-helpers.js';

const now = new Date(2026, 10, 10, 9, 0); // Tuesday

describe('toCapture', () => {
  it('validates each kind', () => {
    expect(
      toCapture(
        { kind: 'todo', text: 'pay rent', tags: ['#Money', 'bad tag'], due: '2026-11-13' },
        now,
      ),
    ).toEqual({
      kind: 'todo',
      text: 'pay rent',
      tags: ['money'],
      due: { date: '2026-11-13' },
    });
    expect(toCapture({ kind: 'log', text: 'ran 5k', tags: [] }, now)).toEqual({
      kind: 'log',
      text: 'ran 5k',
      tags: [],
    });
    expect(
      toCapture(
        { kind: 'budget', text: 'Coffee', tags: [], amount: -3.456, category: 'food' },
        now,
      ),
    ).toEqual({
      kind: 'budget',
      name: 'Coffee',
      amount: 3.46,
      category: 'food',
      date: '2026-11-10',
    });
    expect(
      toCapture({ kind: 'budget', text: 'X', amount: 5, category: 'nope' }, now),
    ).toMatchObject({ category: 'other-outcome' });
    expect(toCapture({ kind: 'habit', text: 'run', due: '2026-11-09' }, now)).toEqual({
      kind: 'habit',
      habit: 'run',
      date: '2026-11-09',
    });
  });

  it('rejects unusable results', () => {
    for (const raw of [
      null,
      'x',
      { kind: 'todo', text: ' ' },
      { kind: 'budget', text: 'a', amount: 0 },
      { kind: 'budget', text: 'a;b', amount: 1 },
      { kind: 'other', text: 'a' },
    ]) {
      expect(toCapture(raw, now)).toBeNull();
    }
    expect(toCapture({ kind: 'todo', text: 'a', due: '2026-02-31' }, now)).toEqual({
      kind: 'todo',
      text: 'a',
      tags: [],
    });
  });
});

describe('parseCapture', () => {
  it('uses the on-device model when available', async () => {
    const model = fakeModel({
      device: true,
      server: true,
      json: { kind: 'todo', text: 'pay rent', tags: ['money'], due: '2026-11-13' },
    });
    const res = await parseCapture('pay rent friday #money', { model, now });
    expect(res).toEqual({
      source: 'model',
      capture: { kind: 'todo', text: 'pay rent', tags: ['money'], due: { date: '2026-11-13' } },
    });
    expect(model.calls).toEqual([
      { kind: 'json', target: 'device', prompt: 'pay rent friday #money' },
    ]);
  });

  it('falls back to the plain capture without a model, when unavailable, on error and on garbage', async () => {
    const plain = { source: 'plain', capture: plainCapture('pay rent #money') };
    expect(await parseCapture('pay rent #money', { model: null, now })).toEqual(plain);
    expect(
      await parseCapture('pay rent #money', { model: fakeModel({ server: true, json: {} }), now }),
    ).toEqual(plain);
    const boom = () => {
      throw new Error('guardrail');
    };
    expect(
      await parseCapture('pay rent #money', {
        model: fakeModel({ device: true, json: boom }),
        now,
      }),
    ).toEqual(plain);
    expect(
      await parseCapture('pay rent #money', {
        model: fakeModel({ device: true, json: { kind: 'x' } }),
        now,
      }),
    ).toEqual(plain);
  });

  it('gives the model the date, known tags and habits, and a schema the Swift side reads', () => {
    const text = captureInstructions(now, { tags: ['money'], habits: ['run'] });
    expect(text).toContain('Tuesday 2026-11-10');
    expect(text).toContain('Known tags: money.');
    expect(text).toContain('Known habits: run.');
    expect(Object.keys(CAPTURE_SCHEMA.properties)).toEqual([
      'kind',
      'text',
      'tags',
      'due',
      'amount',
      'category',
    ]);
    expect(
      describeCapture({ kind: 'todo', text: 'a', tags: ['money'], due: { date: '2026-11-13' } }),
    ).toBe('Todo · due 2026-11-13 · #money');
  });
});

describe('nativeModel', () => {
  it('is null without the module and maps availability and JSON', async () => {
    expect(nativeModel(null)).toBeNull();
    const model = nativeModel({
      availability: (t) => (t === 'device' ? 'available' : 'unsupported-os'),
      generateText: async () => 'hi',
      generateJson: async (_p, _i, schema) => JSON.stringify({ echo: JSON.parse(schema).type }),
      recognizeDocument: async () => null,
    });
    expect(model?.available('device')).toBe(true);
    expect(model?.available('server')).toBe(false);
    expect(await model?.json('p', 'i', CAPTURE_SCHEMA, 'device')).toEqual({ echo: 'object' });
  });
});

describe('saveCapture', () => {
  it('routes todos, logs, budget lines and habit check-ins', async () => {
    const files = memFiles({
      'money/main.budget.csv':
        'name;account;category;date;value\nRent;bank;running-costs;2026-11-01;900',
      'habits/Morning-run.habit.csv': '',
    });
    const controller = controllerFor(files, now);
    const deps = { controller, files };
    expect(
      await saveCapture(
        { kind: 'todo', text: 'pay rent', tags: ['money'], due: { date: '2026-11-13' } },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(files.data['.kh/inbox.todos.md']).toMatch(
      /- \[ \] pay rent #money\n.*::due:: 2026-11-13/,
    );
    expect(await saveCapture({ kind: 'log', text: 'ran', tags: ['run'] }, deps)).toMatchObject({
      ok: true,
    });
    expect(files.data['.kh/inbox.actionlog.md']).toContain('ran');
    expect(
      await saveCapture(
        { kind: 'budget', name: 'Coffee', amount: 3.5, category: 'food', date: '2026-11-10' },
        deps,
      ),
    ).toMatchObject({ ok: true, path: 'money/main.budget.csv' });
    expect(files.data['money/main.budget.csv']).toContain('Coffee;bank;food;2026-11-10;3.5');
    expect(
      await saveCapture({ kind: 'habit', habit: 'morning run', date: '2026-11-10' }, deps),
    ).toMatchObject({ ok: true, message: 'Checked in Morning-run' });
    expect(files.data['habits/Morning-run.habit.csv']).toContain('2026-11-10');
  });

  it('logs budget and habit captures when their file is missing', async () => {
    const files = memFiles();
    const deps = { controller: controllerFor(files, now), files };
    await saveCapture(
      { kind: 'budget', name: 'Coffee', amount: 3.5, category: 'food', date: '2026-11-10' },
      deps,
    );
    await saveCapture({ kind: 'habit', habit: 'yoga', date: '2026-11-10' }, deps);
    expect(files.data['.kh/inbox.actionlog.md']).toContain('Coffee: 3.5');
    expect(files.data['.kh/inbox.actionlog.md']).toContain('yoga');
  });

  it('matches habits loosely but not to unrelated names', () => {
    const paths = ['a/Read.habit.csv', 'a/Morning-run.habit.csv'];
    expect(findHabit(paths, 'Morning Run')).toBe('a/Morning-run.habit.csv');
    expect(findHabit(paths, 'run')).toBe('a/Morning-run.habit.csv');
    expect(findHabit(paths, 'swim')).toBeUndefined();
    expect(findHabit(paths, '!!')).toBeUndefined();
  });
});

describe('Siri queue', () => {
  const store = (initial: string | null) => {
    const files: Record<string, string> =
      initial === null ? {} : { [SMART_CAPTURE_QUEUE_FILE]: initial };
    return {
      files,
      read: (n: string) => files[n] ?? null,
      write: (n: string, c: string) => {
        files[n] = c;
      },
    };
  };

  it('parses entries, keeping the spoken text when the capture is unusable', () => {
    const json = JSON.stringify([
      {
        text: 'coffee 3.50',
        capturedAt: '2026-11-09T08:00:00.000Z',
        capture: { kind: 'budget', text: 'Coffee', tags: [], amount: 3.5, category: 'food' },
      },
      { text: 'call mum', capture: { kind: 'nope' } },
      { capture: { kind: 'nope' } },
      7,
    ]);
    expect(parseQueue(json, now)).toEqual([
      {
        text: 'coffee 3.50',
        capture: {
          kind: 'budget',
          name: 'Coffee',
          amount: 3.5,
          category: 'food',
          date: '2026-11-09',
        },
      },
      { text: 'call mum', capture: { kind: 'todo', text: 'call mum', tags: [] } },
    ]);
    expect(parseQueue('{bad', now)).toEqual([]);
    expect(parseQueue(null, now)).toEqual([]);
  });

  it('drains, keeping failed entries for the next launch', async () => {
    const s = store(
      JSON.stringify([
        { text: 'a', capture: { kind: 'log', text: 'a', tags: [] } },
        { text: 'b', capture: { kind: 'log', text: 'b', tags: [] } },
      ]),
    );
    const saved = await drainQueue(
      s,
      async (c) => ({ ok: c.kind === 'log' && c.text === 'a' }),
      now,
    );
    expect(saved).toBe(1);
    expect(parseQueue(s.files[SMART_CAPTURE_QUEUE_FILE] ?? null, now)).toEqual([
      { text: 'b', capture: { kind: 'log', text: 'b', tags: [] } },
    ]);
    expect(await drainQueue(store(null), async () => ({ ok: true }), now)).toBe(0);
  });

  it('round-trips every kind through the queue field names', () => {
    for (const c of [
      { kind: 'todo', text: 'a', tags: ['x'], due: { date: '2026-11-13', time: '09:30' } },
      { kind: 'log', text: 'a', tags: [] },
      { kind: 'budget', name: 'a', amount: 2, category: 'food', date: '2026-11-10' },
      { kind: 'habit', habit: 'run', date: '2026-11-10' },
    ] satisfies SmartCapture[]) {
      expect(toCapture(toRaw(c), now)).toEqual(c);
    }
  });
});
