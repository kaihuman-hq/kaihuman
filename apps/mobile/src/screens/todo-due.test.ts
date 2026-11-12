import {
  MAX_REPEAT_INTERVAL,
  parseTodos,
  serializeTodos,
  type TodoItem,
  type TodoRepeat,
} from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { KanbanBoardController } from './kanban-board.js';
import { QuickCaptureController, type RepoFiles } from './quick-capture.js';
import {
  completionNotice,
  DUE_PRESETS,
  dateFromDue,
  dueBadge,
  dueFromDate,
  dueFromPreset,
  dueSummary,
  REPEAT_PRESETS,
  repeatEveryLabel,
  repeatFromPreset,
  repeatPreset,
  repeatSummary,
  repeatWeekdays,
  retargetRepeat,
  setDueOnData,
  setRepeatOnData,
  toggleRepeatWeekday,
  weekdayOf,
  withRepeatInterval,
} from './todo-due.js';

// Local noon, so date maths cannot straddle a day by DST or timezone.
const NOW = new Date(2026, 10, 10, 12, 0);

describe('dueFromPreset', () => {
  it('computes today and tomorrow in local time', () => {
    expect(dueFromPreset('today', NOW)).toEqual({ date: '2026-11-10' });
    expect(dueFromPreset('tomorrow', NOW)).toEqual({ date: '2026-11-11' });
  });

  it('rolls over month and year ends', () => {
    expect(dueFromPreset('tomorrow', new Date(2026, 11, 31, 23, 59))).toEqual({
      date: '2027-01-01',
    });
    expect(dueFromPreset('tomorrow', new Date(2026, 1, 28, 8, 0))).toEqual({ date: '2026-03-01' });
  });
});

describe('next weekday presets', () => {
  // NOW is Tuesday 2026-11-10.
  it('picks the next Saturday and Monday strictly after today', () => {
    expect(dueFromPreset('next-saturday', NOW)).toEqual({ date: '2026-11-14' });
    expect(dueFromPreset('next-monday', NOW)).toEqual({ date: '2026-11-16' });
  });

  it('skips a full week when today is that day', () => {
    expect(dueFromPreset('next-saturday', new Date(2026, 10, 14, 9))).toEqual({
      date: '2026-11-21',
    });
    expect(dueFromPreset('next-monday', new Date(2026, 10, 16, 23, 59))).toEqual({
      date: '2026-11-23',
    });
  });

  it('crosses month and year ends', () => {
    expect(dueFromPreset('next-monday', new Date(2026, 11, 31, 8))).toEqual({
      date: '2027-01-04',
    });
    expect(dueFromPreset('next-saturday', new Date(2026, 11, 26, 8))).toEqual({
      date: '2027-01-02',
    });
  });

  it('lists the presets in menu order', () => {
    expect(DUE_PRESETS.map((p) => p.label)).toEqual([
      'Today',
      'Tomorrow',
      'Next Saturday',
      'Next Monday',
    ]);
  });
});

describe('dueFromDate / dateFromDue', () => {
  it('builds a due from a picked date, with or without a time', () => {
    const picked = new Date(2026, 10, 12, 9, 5);
    expect(dueFromDate(picked)).toEqual({ date: '2026-11-12' });
    expect(dueFromDate(picked, new Date(2026, 0, 1, 14, 30))).toEqual({
      date: '2026-11-12',
      time: '14:30',
    });
  });

  it('round-trips into a local Date, defaulting to now', () => {
    const d = dateFromDue({ date: '2026-11-12', time: '07:45' }, NOW);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 10, 12, 7, 45,
    ]);
    expect(dateFromDue(undefined, NOW).getTime()).toBe(NOW.getTime());
  });
});

describe('dueBadge', () => {
  const item = (over: Partial<TodoItem>): TodoItem => ({
    ...(parseTodos('- [ ] x\n').items[0] as TodoItem),
    ...over,
  });

  it('has no badge without a date or for finished todos', () => {
    expect(dueBadge(item({}), NOW)).toBeUndefined();
    expect(dueBadge(item({ dueDate: '2026-11-01', status: 'done' }), NOW)).toBeUndefined();
  });

  it('labels overdue, today and upcoming with tones', () => {
    expect(dueBadge(item({ dueDate: '2026-11-08' }), NOW)).toEqual({
      label: 'Overdue · Nov 8',
      tone: 'danger',
    });
    expect(dueBadge(item({ dueDate: '2026-11-10' }), NOW)).toEqual({
      label: 'Today',
      tone: 'warning',
    });
    expect(dueBadge(item({ dueDate: '2026-11-10', dueTime: '14:00' }), NOW)).toEqual({
      label: 'Today 14:00',
      tone: 'warning',
    });
    expect(dueBadge(item({ dueDate: '2026-11-11' }), NOW)).toEqual({
      label: 'Tomorrow',
      tone: 'neutral',
    });
    expect(dueBadge(item({ dueDate: '2026-11-20', dueTime: '09:00' }), NOW)).toEqual({
      label: 'Nov 20 09:00',
      tone: 'neutral',
    });
  });

  it('flags a timed todo as overdue once its time has passed today', () => {
    expect(dueBadge(item({ dueDate: '2026-11-10', dueTime: '09:00' }), NOW)).toMatchObject({
      tone: 'danger',
    });
  });
});

describe('dueSummary', () => {
  it('describes the current due for the picker button', () => {
    expect(dueSummary(undefined)).toBe('No due date');
    expect(dueSummary({ date: '2026-11-12' })).toBe('Nov 12, 2026');
    expect(dueSummary({ date: '2026-11-12', time: '09:00' })).toBe('Nov 12, 2026 at 09:00');
  });
});

describe('setDueOnData', () => {
  const data = parseTodos('- [ ] a\n- [ ] b\n');

  it('sets and clears by index', () => {
    const set = setDueOnData(data, 1, { date: '2026-11-12', time: '09:00' });
    expect(parseTodos(serializeTodos(set)).items[1]).toMatchObject({
      dueDate: '2026-11-12',
      dueTime: '09:00',
    });
    const cleared = setDueOnData(set, 1, undefined);
    expect(parseTodos(serializeTodos(cleared)).items[1]?.dueDate).toBeUndefined();
  });

  it('throws for a missing todo or an impossible date', () => {
    expect(() => setDueOnData(data, 5, { date: '2026-11-12' })).toThrow('Todo not found');
    expect(() => setDueOnData(data, 0, { date: '2026-02-31' })).toThrow('Invalid due date');
  });
});

class MemoryFiles implements RepoFiles {
  constructor(public store = new Map<string, string>()) {}
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    this.store.set(p, c);
  }
}

const INBOX = '.kh/inbox.todos.md';

describe('board due edits', () => {
  it('sets and clears a due date through the board controller', async () => {
    const files = new MemoryFiles(new Map([[INBOX, '- [ ] a\n- [ ] b\n']]));
    const board = new KanbanBoardController(files);
    await board.load();
    expect(await board.setDue(INBOX, 1, { date: '2026-11-11' })).toEqual({ ok: true });
    const items = parseTodos(files.store.get(INBOX) ?? '').items;
    expect(items[1]?.dueDate).toBe('2026-11-11');
    expect(items[0]?.dueDate).toBeUndefined();
    await board.setDue(INBOX, 1, undefined);
    expect(parseTodos(files.store.get(INBOX) ?? '').items[1]?.dueDate).toBeUndefined();
  });

  it('reports a missing todo', async () => {
    const files = new MemoryFiles(new Map([[INBOX, '- [ ] a\n']]));
    const board = new KanbanBoardController(files);
    await board.load();
    expect(await board.setDue(INBOX, 3, { date: '2026-11-11' })).toEqual({
      ok: false,
      error: 'Todo not found',
    });
  });
});

describe('quick todo with a due date', () => {
  it('stores the due on the new todo only', async () => {
    const files = new MemoryFiles(new Map([[INBOX, '- [ ] first\n']]));
    const c = new QuickCaptureController(files, () => NOW);
    const res = await c.quickTodo('second', undefined, { date: '2026-11-12', time: '08:30' });
    expect(res).toMatchObject({ ok: true });
    const items = parseTodos(files.store.get(INBOX) ?? '').items;
    expect(items[0]?.dueDate).toBeUndefined();
    expect(items[1]).toMatchObject({ text: 'second', dueDate: '2026-11-12', dueTime: '08:30' });
  });

  it('rejects an invalid due without writing', async () => {
    const files = new MemoryFiles();
    const c = new QuickCaptureController(files, () => NOW);
    expect(await c.quickTodo('x', undefined, { date: 'nope' })).toEqual({
      ok: false,
      error: 'Invalid due date',
    });
    expect(files.store.size).toBe(0);
  });
});

// 2026-11-12 is a Thursday.
const DUE = '2026-11-12';

describe('repeat presets', () => {
  it('maps every preset to a rule pinned to the due date', () => {
    expect(REPEAT_PRESETS.map((p) => p.value)).toEqual([
      'none',
      'daily',
      'weekdays',
      'weekly',
      'monthly',
      'yearly',
    ]);
    expect(repeatFromPreset('none', DUE)).toBeUndefined();
    expect(repeatFromPreset('daily', DUE)).toEqual({ unit: 'day', interval: 1 });
    expect(repeatFromPreset('weekdays', DUE)).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: [0, 1, 2, 3, 4],
    });
    expect(repeatFromPreset('weekly', DUE)).toEqual({ unit: 'week', interval: 1, weekdays: [3] });
    expect(repeatFromPreset('monthly', DUE)).toEqual({ unit: 'month', interval: 1, day: 12 });
    expect(repeatFromPreset('yearly', DUE)).toEqual({ unit: 'year', interval: 1, date: '11-12' });
  });

  it('round-trips each preset through repeatPreset, custom rules falling under their unit', () => {
    for (const { value } of REPEAT_PRESETS) {
      expect(repeatPreset(repeatFromPreset(value, DUE))).toBe(value);
    }
    expect(repeatPreset({ unit: 'week', interval: 2, weekdays: [0, 1, 2, 3, 4] })).toBe('weekly');
    expect(repeatPreset({ unit: 'day', interval: 3 })).toBe('daily');
  });

  it('weekdayOf counts from Monday', () => {
    expect(weekdayOf('2026-11-09')).toBe(0);
    expect(weekdayOf(DUE)).toBe(3);
    expect(weekdayOf('2026-11-15')).toBe(6);
  });
});

describe('repeat editing helpers', () => {
  it('clamps the interval to 1..MAX_REPEAT_INTERVAL', () => {
    const daily = { unit: 'day', interval: 1 } as const;
    expect(withRepeatInterval(daily, 4)).toEqual({ unit: 'day', interval: 4 });
    expect(withRepeatInterval(daily, 0).interval).toBe(1);
    expect(withRepeatInterval(daily, -5).interval).toBe(1);
    expect(withRepeatInterval(daily, MAX_REPEAT_INTERVAL + 1).interval).toBe(MAX_REPEAT_INTERVAL);
  });

  it('toggles weekdays, sorted, never leaving the list empty', () => {
    const weekly: TodoRepeat = { unit: 'week', interval: 2, weekdays: [3] };
    const two = toggleRepeatWeekday(weekly, 0, DUE);
    expect(two).toEqual({ unit: 'week', interval: 2, weekdays: [0, 3] });
    expect(toggleRepeatWeekday(two, 3, DUE)).toEqual({ unit: 'week', interval: 2, weekdays: [0] });
    expect(toggleRepeatWeekday(weekly, 3, DUE)).toBe(weekly);
    // A list-less weekly rule fires on the due weekday.
    expect(repeatWeekdays({ unit: 'week', interval: 1 }, DUE)).toEqual([3]);
    expect(toggleRepeatWeekday({ unit: 'week', interval: 1 }, 5, DUE)).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: [3, 5],
    });
  });

  it('labels the stepper and summarizes rules', () => {
    expect(repeatEveryLabel({ unit: 'day', interval: 1 })).toBe('Every day');
    expect(repeatEveryLabel({ unit: 'week', interval: 2 })).toBe('Every 2 weeks');
    expect(repeatSummary(undefined)).toBe('Does not repeat');
    expect(repeatSummary({ unit: 'week', interval: 2, weekdays: [0, 3] })).toBe(
      'Every 2 weeks on Mon, Thu',
    );
  });

  it('retargets only the part pinned to the old date', () => {
    expect(retargetRepeat({ unit: 'week', interval: 1, weekdays: [3] }, DUE, '2026-11-13')).toEqual(
      { unit: 'week', interval: 1, weekdays: [4] },
    );
    const twoDays: TodoRepeat = { unit: 'week', interval: 1, weekdays: [0, 3] };
    expect(retargetRepeat(twoDays, DUE, '2026-11-13')).toBe(twoDays);
    expect(retargetRepeat({ unit: 'month', interval: 1, day: 12 }, DUE, '2026-11-20')).toEqual({
      unit: 'month',
      interval: 1,
      day: 20,
    });
    expect(retargetRepeat({ unit: 'year', interval: 1, date: '11-12' }, DUE, '2027-01-05')).toEqual(
      { unit: 'year', interval: 1, date: '01-05' },
    );
  });
});

describe('recurring todos on data', () => {
  const data = parseTodos(`- [ ] a\n::due:: ${DUE} ::repeat:: weekly:thu\n- [ ] b\n`);

  it('marks the badge of a recurring todo with its rule', () => {
    const [a, b] = data.items as [TodoItem, TodoItem];
    expect(dueBadge(a, NOW)).toEqual({ label: 'Nov 12', tone: 'neutral', repeat: 'Weekly on Thu' });
    expect(dueBadge({ ...b, dueDate: DUE }, NOW)).not.toHaveProperty('repeat');
  });

  it('clears the repeat with the due date and carries a pinned rule to a new date', () => {
    expect(setDueOnData(data, 0, undefined).items[0]).not.toHaveProperty('repeat');
    expect(setDueOnData(data, 0, { date: '2026-11-13' }).items[0]?.repeat).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: [4],
    });
  });

  it('sets a repeat only on a dated todo', () => {
    expect(setRepeatOnData(data, 0, { unit: 'day', interval: 2 }).items[0]?.repeat).toEqual({
      unit: 'day',
      interval: 2,
    });
    expect(setRepeatOnData(data, 0, undefined).items[0]).not.toHaveProperty('repeat');
    expect(() => setRepeatOnData(data, 1, { unit: 'day', interval: 1 })).toThrow(
      'Set a due date first',
    );
    expect(() => setRepeatOnData(data, 9, undefined)).toThrow('Todo not found');
  });

  it('announces the next due when completing a recurring todo only', () => {
    const [a, b] = data.items as [TodoItem, TodoItem];
    expect(completionNotice(a, NOW)).toBe('Done. Next due Nov 19, 2026');
    expect(completionNotice({ ...a, dueTime: '08:00' }, NOW)).toBe(
      'Done. Next due Nov 19, 2026 at 08:00',
    );
    expect(completionNotice(b, NOW)).toBeUndefined();
  });

  it('quick add stores the due and the repeat on the new todo', async () => {
    const files = new MemoryFiles(new Map([[INBOX, '- [ ] first\n']]));
    const c = new QuickCaptureController(files, () => NOW);
    const res = await c.quickTodo(
      'water plants',
      undefined,
      { date: DUE },
      {
        unit: 'week',
        interval: 1,
        weekdays: [3],
      },
    );
    expect(res).toMatchObject({ ok: true });
    expect(files.store.get(INBOX)).toContain('::repeat:: weekly:thu');
    const items = parseTodos(files.store.get(INBOX) ?? '').items;
    expect(items[0]?.repeat).toBeUndefined();
    expect(items[1]).toMatchObject({ dueDate: DUE, repeat: { unit: 'week', weekdays: [3] } });
  });

  it('the board sets due and repeat in one write, keeps the rule by default and clears it with null', async () => {
    const files = new MemoryFiles(new Map([[INBOX, '- [ ] a\n']]));
    const board = new KanbanBoardController(files);
    await board.load();
    const rule = { unit: 'month', interval: 1, day: 12 } as const;
    expect(await board.setDue(INBOX, 0, { date: DUE }, rule)).toEqual({ ok: true });
    expect(parseTodos(files.store.get(INBOX) ?? '').items[0]?.repeat).toEqual(rule);
    await board.setDue(INBOX, 0, { date: DUE, time: '09:00' });
    expect(parseTodos(files.store.get(INBOX) ?? '').items[0]?.repeat).toEqual(rule);
    await board.setDue(INBOX, 0, { date: DUE }, null);
    expect(parseTodos(files.store.get(INBOX) ?? '').items[0]?.repeat).toBeUndefined();
  });

  it('completing on the board advances a recurring todo', async () => {
    const files = new MemoryFiles(new Map([[INBOX, `- [ ] a\n::due:: ${DUE} ::repeat:: daily\n`]]));
    const board = new KanbanBoardController(files);
    await board.load();
    await board.setStatus(INBOX, 0, 'done');
    const item = parseTodos(files.store.get(INBOX) ?? '').items[0];
    expect(item?.status).toBe('backlog');
    expect((item?.dueDate ?? '') > DUE).toBe(true);
  });
});
