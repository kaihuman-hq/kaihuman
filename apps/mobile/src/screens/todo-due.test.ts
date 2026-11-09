import { parseTodos, serializeTodos, type TodoItem } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { KanbanBoardController } from './kanban-board.js';
import { QuickCaptureController, type RepoFiles } from './quick-capture.js';
import {
  dateFromDue,
  dueBadge,
  dueFromDate,
  dueFromPreset,
  dueSummary,
  setDueOnData,
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
