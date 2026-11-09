import { describe, expect, it } from 'vitest';
import {
  compareDue,
  cyclePriority,
  dueStatus,
  formatDue,
  maxPriorityRank,
  moveTodo,
  PRIORITY_LABELS,
  PRIORITY_RANK,
  parseTodos,
  serializeTodos,
  setTodoColor,
  setTodoDue,
  setTodoPriority,
  TODO_COLOR_HEX,
  TODO_COLORS,
  type TodoItem,
  type TodoStatus,
} from './todos.js';

describe('parseTodos', () => {
  it('reads milestones and todos the way the console writes them', () => {
    const md = [
      '---',
      'milestones:',
      '  - id: v1',
      '    name: Launch',
      '    dueDate: 2026-09-30',
      '---',
      '',
      '- [>] Implement demo mode #dev !v1',
      '::created:: 2026-09-01T00:00:00.000Z',
      '- [x] Done thing',
    ].join('\n');
    const { milestones, items } = parseTodos(md);
    expect(milestones).toEqual([{ id: 'v1', name: 'Launch', dueDate: '2026-09-30' }]);
    expect(items[0]).toMatchObject({
      text: 'Implement demo mode',
      status: 'in-progress',
      tags: ['dev'],
      milestoneId: 'v1',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    expect(items[1]).toMatchObject({ text: 'Done thing', status: 'done' });
  });
});

describe('moveTodo', () => {
  const data = parseTodos('- [ ] a\n- [ ] b\n- [ ] c\n');
  it('moves an item down and up', () => {
    expect(moveTodo(data, 0, 2).items.map((i) => i.text)).toEqual(['b', 'c', 'a']);
    expect(moveTodo(data, 2, 0).items.map((i) => i.text)).toEqual(['c', 'a', 'b']);
  });
  it('ignores out-of-range indexes', () => {
    expect(moveTodo(data, 0, 5)).toBe(data);
    expect(moveTodo(data, -1, 1)).toBe(data);
  });
});

describe('file color', () => {
  it('round-trips color in frontmatter, with and without milestones', () => {
    const withBoth = '---\ncolor: sky\nmilestones:\n  - id: v1\n    name: L\n---\n\n- [ ] a\n';
    const d = parseTodos(withBoth);
    expect(d.color).toBe('sky');
    expect(d.milestones).toHaveLength(1);
    expect(parseTodos(serializeTodos(d))).toEqual(d);
    const only = serializeTodos(setTodoColor(parseTodos('- [ ] a\n'), 'pink'));
    expect(only).toBe('---\ncolor: pink\n---\n\n- [ ] a\n');
    expect(parseTodos(only).color).toBe('pink');
  });
  it('ignores unknown colors and omits frontmatter when unset', () => {
    expect(parseTodos('---\ncolor: mauve\n---\n\n- [ ] a\n').color).toBeUndefined();
    expect(serializeTodos(parseTodos('- [ ] a\n'))).toBe('- [ ] a\n');
    expect(
      serializeTodos(setTodoColor(setTodoColor(parseTodos('- [ ] a\n'), 'red'), undefined)),
    ).toBe('- [ ] a\n');
  });
  it('has a hex per color', () => {
    for (const c of TODO_COLORS) expect(TODO_COLOR_HEX[c]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('item priority', () => {
  it('round-trips the token after tags and milestone', () => {
    const md = '- [ ] fix it #dev !v1 ^super-high\n- [>] other ^high\n- [ ] x ^ultra-high\n';
    const d = parseTodos(md);
    expect(d.items.map((i) => i.priority)).toEqual(['super-high', 'high', 'ultra-high']);
    expect(d.items[0]).toMatchObject({ text: 'fix it', tags: ['dev'], milestoneId: 'v1' });
    expect(serializeTodos(d)).toBe(md);
  });
  it('keeps unknown ^tokens in text', () => {
    const d = parseTodos('- [ ] a ^foo b\n');
    expect(d.items[0]?.text).toBe('a ^foo b');
    expect(d.items[0]?.priority).toBeUndefined();
  });
  it('setTodoPriority sets, clears and bumps updatedAt', () => {
    const d = parseTodos('- [ ] a\n');
    const s = setTodoPriority(d, 'item-0', 'high');
    expect(s.items[0]?.priority).toBe('high');
    expect(s.items[0]?.updatedAt).toBeGreaterThan(0);
    expect(setTodoPriority(s, 'item-0', undefined).items[0]?.priority).toBeUndefined();
    expect(setTodoPriority(d, 'nope', 'high')).toBe(d);
  });
  it('cycles none > high > super-high > ultra-high > none', () => {
    expect(cyclePriority(undefined)).toBe('high');
    expect(cyclePriority('high')).toBe('super-high');
    expect(cyclePriority('super-high')).toBe('ultra-high');
    expect(cyclePriority('ultra-high')).toBeUndefined();
  });
  it('maxPriorityRank counts only open items', () => {
    expect(PRIORITY_RANK).toEqual({ high: 1, 'super-high': 2, 'ultra-high': 3 });
    expect(PRIORITY_LABELS['ultra-high']).toBeTruthy();
    const d = parseTodos(
      '- [x] a ^ultra-high\n- [ ] b ^high\n- [>] c ^super-high\n- [-] d ^ultra-high\n',
    );
    expect(maxPriorityRank(d.items)).toBe(2);
    expect(maxPriorityRank([])).toBe(0);
  });
});

describe('item due date', () => {
  it('parses a date-only and a timed due on the metadata line', () => {
    const md =
      '- [ ] a\n::updated:: 1 ::created:: 2026-01-01T00:00:00.000Z ::due:: 2026-11-10\n' +
      '- [ ] b\n::due:: 2026-11-10T14:00\n';
    const [a, b] = parseTodos(md).items;
    expect(a).toMatchObject({ dueDate: '2026-11-10', updatedAt: 1 });
    expect(a?.dueTime).toBeUndefined();
    expect(b).toMatchObject({ dueDate: '2026-11-10', dueTime: '14:00' });
  });
  it('round-trips due dates and keeps prompts after the metadata line', () => {
    const md =
      '- [ ] a #x\n::updated:: 5 ::due:: 2026-11-10T09:30\n  > prompt\n- [ ] b\n::due:: 2026-12-01\n';
    const d = parseTodos(md);
    expect(d.items[0]?.prompt?.lines).toEqual(['prompt']);
    expect(serializeTodos(d)).toBe(md);
  });
  it('leaves files without due dates unchanged byte for byte', () => {
    const md =
      '---\nmilestones:\n  - id: v1\n    name: V1\n    dueDate: 2026-09-30\n---\n\n' +
      '- [>] a #t !v1\n::updated:: 9 ::created:: 2026-01-01T00:00:00.000Z\n- [ ] b\n';
    const d = parseTodos(md);
    expect(d.items.every((i) => i.dueDate === undefined && i.dueTime === undefined)).toBe(true);
    expect(serializeTodos(d)).toBe(md);
  });
  it('ignores malformed values', () => {
    for (const bad of [
      'tomorrow',
      '2026-13-01',
      '2026-02-30',
      '2026-11-10T25:00',
      '2026-11-10T9:00',
      '2026-11-10 14:00',
    ]) {
      const d = parseTodos(`- [ ] a\n::updated:: 1 ::due:: ${bad}\n`);
      expect(d.items[0]?.dueDate, bad).toBeUndefined();
      expect(d.items[0]?.updatedAt).toBe(1);
    }
  });
  it('setTodoDue sets, clears and bumps updatedAt; timed due needs a date', () => {
    const d = parseTodos('- [ ] a\n');
    const s = setTodoDue(d, 'item-0', { date: '2026-11-10', time: '08:00' });
    expect(s.items[0]).toMatchObject({ dueDate: '2026-11-10', dueTime: '08:00' });
    expect(s.items[0]?.updatedAt).toBeGreaterThan(0);
    expect(serializeTodos(s)).toMatch(/::due:: 2026-11-10T08:00\n$/);
    const c = setTodoDue(s, 'item-0', undefined);
    expect(c.items[0]?.dueDate).toBeUndefined();
    expect(c.items[0]?.dueTime).toBeUndefined();
    expect(serializeTodos(c)).not.toContain('::due::');
    expect(setTodoDue(d, 'nope', { date: '2026-11-10' })).toBe(d);
    expect(setTodoDue(d, 'item-0', { date: 'bad' })).toBe(d);
  });
  it('dueStatus is overdue, today or upcoming in local time; closed items have none', () => {
    const now = new Date(2026, 10, 10, 12, 0).getTime();
    const item = (
      dueDate?: string,
      dueTime?: string,
      status: TodoStatus = 'backlog',
    ): TodoItem => ({
      id: 'i',
      text: 't',
      status,
      tags: [],
      dueDate,
      dueTime,
    });
    expect(dueStatus(item(), now)).toBeUndefined();
    expect(dueStatus(item('2026-11-09'), now)).toBe('overdue');
    expect(dueStatus(item('2026-11-10'), now)).toBe('today');
    expect(dueStatus(item('2026-11-10', '11:00'), now)).toBe('overdue');
    expect(dueStatus(item('2026-11-10', '13:00'), now)).toBe('today');
    expect(dueStatus(item('2026-11-11'), now)).toBe('upcoming');
    expect(dueStatus(item('2026-11-09', undefined, 'done'), now)).toBeUndefined();
  });
  it('compareDue sorts by date then time, undated last', () => {
    const it = (dueDate?: string, dueTime?: string) => ({ dueDate, dueTime });
    const sorted = [it(), it('2026-11-10', '14:00'), it('2026-11-10'), it('2026-11-09')].sort(
      compareDue,
    );
    expect(sorted).toEqual([it('2026-11-09'), it('2026-11-10', '14:00'), it('2026-11-10'), it()]);
  });
  it('formatDue renders the stored value', () => {
    expect(formatDue({ dueDate: '2026-11-10' })).toBe('2026-11-10');
    expect(formatDue({ dueDate: '2026-11-10', dueTime: '14:00' })).toBe('2026-11-10T14:00');
    expect(formatDue({})).toBeUndefined();
  });
});
