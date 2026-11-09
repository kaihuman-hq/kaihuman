import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  IOS_PENDING_LIMIT,
  localDate,
  type NotificationSettings,
  notificationSignature,
  type PlannerTodo,
  planNotifications,
  zonedTime,
} from './planner.js';

const LA = 'America/Los_Angeles';
const BERLIN = 'Europe/Berlin';
const TOKYO = 'Asia/Tokyo';
const NY = 'America/New_York';

const on = (over: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  enabled: true,
  digest: false,
  ...over,
});
const todo = (id: string, over: Partial<PlannerTodo> = {}): PlannerTodo => ({
  id,
  text: `Todo ${id}`,
  status: 'backlog',
  ...over,
});
// 2026-06-10 00:00 UTC; "today" is 06-09 in LA, 06-10 in Berlin and Tokyo.
const first = <T>(xs: T[]): T => {
  const x = xs[0];
  if (x === undefined) throw new Error('expected at least one element');
  return x;
};
const NOW = Date.UTC(2026, 5, 10, 0, 0);

describe('zonedTime / localDate', () => {
  it('maps wall time to UTC per zone', () => {
    expect(zonedTime('2026-06-10', '09:00', 'UTC')).toBe(Date.UTC(2026, 5, 10, 9));
    expect(zonedTime('2026-06-10', '09:00', BERLIN)).toBe(Date.UTC(2026, 5, 10, 7));
    expect(zonedTime('2026-06-10', '09:00', TOKYO)).toBe(Date.UTC(2026, 5, 10, 0));
  });
  it('handles US spring-forward and fall-back', () => {
    expect(zonedTime('2026-03-07', '09:00', NY)).toBe(Date.UTC(2026, 2, 7, 14));
    expect(zonedTime('2026-03-08', '09:00', NY)).toBe(Date.UTC(2026, 2, 8, 13));
    expect(zonedTime('2026-11-01', '09:00', NY)).toBe(Date.UTC(2026, 10, 1, 14));
    expect(zonedTime('2026-10-31', '09:00', NY)).toBe(Date.UTC(2026, 9, 31, 13));
  });
  it('moves a nonexistent gap time forward by the gap', () => {
    expect(zonedTime('2026-03-08', '02:30', NY)).toBe(zonedTime('2026-03-08', '03:30', NY));
    expect(zonedTime('2026-03-08', '02:30', NY)).toBe(Date.UTC(2026, 2, 8, 7, 30));
  });
  it('resolves an ambiguous fall-back time to the earlier instant', () => {
    expect(zonedTime('2026-11-01', '01:30', NY)).toBe(Date.UTC(2026, 10, 1, 5, 30));
  });
  it('localDate reads the date in the zone', () => {
    expect(localDate(NOW, LA)).toBe('2026-06-09');
    expect(localDate(NOW, BERLIN)).toBe('2026-06-10');
    expect(localDate(NOW, TOKYO)).toBe('2026-06-10');
  });
});

describe('planNotifications', () => {
  it('returns nothing when disabled', () => {
    const t = [todo('a', { dueDate: '2026-06-11' })];
    expect(planNotifications(t, [], { ...on(), enabled: false }, NOW, BERLIN)).toEqual([]);
  });

  it('due-today fires at morningTime in each tz', () => {
    const t = [todo('a', { dueDate: '2026-06-11' })];
    const at = (tz: string) => first(planNotifications(t, [], on(), NOW, tz));
    expect(at(LA).fireAt).toBe(Date.UTC(2026, 5, 11, 16));
    expect(at(BERLIN).fireAt).toBe(Date.UTC(2026, 5, 11, 7));
    expect(at(TOKYO).fireAt).toBe(Date.UTC(2026, 5, 11, 0));
    expect(at(LA)).toMatchObject({
      id: 'kh:due-today:a',
      kind: 'due-today',
      title: 'Due today',
      body: 'Todo a',
      todoId: 'a',
      url: 'kaihuman://board?item=a',
    });
  });

  it('honors a custom morningTime in tz', () => {
    const t = [todo('a', { dueDate: '2026-06-11' })];
    const n = first(planNotifications(t, [], on({ morningTime: '07:30' }), NOW, BERLIN));
    expect(n.fireAt).toBe(Date.UTC(2026, 5, 11, 5, 30));
  });

  it('uses 09:00 local across DST changes', () => {
    const t = [todo('a', { dueDate: '2026-03-08' }), todo('b', { dueDate: '2026-11-01' })];
    const s = on();
    const spring = planNotifications(t, [], s, Date.UTC(2026, 2, 6), NY);
    expect(spring.find((n) => n.todoId === 'a')?.fireAt).toBe(Date.UTC(2026, 2, 8, 13));
    const fall = planNotifications(t, [], s, Date.UTC(2026, 9, 30), NY);
    expect(fall.find((n) => n.todoId === 'b')?.fireAt).toBe(Date.UTC(2026, 10, 1, 14));
  });

  it('due-soon fires minutesBefore a timed due', () => {
    const t = [todo('a', { dueDate: '2026-06-11', dueTime: '14:00' })];
    const out = planNotifications(t, [], on(), NOW, BERLIN);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'kh:due-soon:a',
      kind: 'due-soon',
      title: 'Due at 14:00',
      fireAt: zonedTime('2026-06-11', '14:00', BERLIN) - 15 * 60_000,
    });
  });

  it('skips due-soon when the lead time has passed but the due time has not', () => {
    const due = zonedTime('2026-06-10', '14:00', BERLIN);
    const now = due - 5 * 60_000;
    const t = [todo('a', { dueDate: '2026-06-10', dueTime: '14:00' })];
    expect(planNotifications(t, [], on(), now, BERLIN)).toEqual([]);
  });

  it('produces nothing for done or rejected todos', () => {
    const t = [
      todo('a', { dueDate: '2026-06-11', status: 'done' }),
      todo('b', { dueDate: '2026-06-11', dueTime: '10:00', status: 'rejected' }),
      todo('c', { dueDate: '2026-06-01', status: 'done' }),
    ];
    expect(planNotifications(t, [], on({ digest: true }), NOW, BERLIN)).toEqual([]);
  });

  it('closing a todo removes its notification id', () => {
    const open = [todo('a', { dueDate: '2026-06-11' })];
    const closed = [todo('a', { dueDate: '2026-06-11', status: 'done' })];
    expect(planNotifications(open, [], on(), NOW, BERLIN).map((n) => n.id)).toEqual([
      'kh:due-today:a',
    ]);
    expect(planNotifications(closed, [], on(), NOW, BERLIN)).toEqual([]);
  });

  it('edits change the signature but keep the id', () => {
    const base = first(
      planNotifications([todo('a', { dueDate: '2026-06-11' })], [], on(), NOW, BERLIN),
    );
    const same = first(
      planNotifications([todo('a', { dueDate: '2026-06-11' })], [], on(), NOW, BERLIN),
    );
    const text = first(
      planNotifications([todo('a', { text: 'New', dueDate: '2026-06-11' })], [], on(), NOW, BERLIN),
    );
    const date = first(
      planNotifications([todo('a', { dueDate: '2026-06-12' })], [], on(), NOW, BERLIN),
    );
    expect(notificationSignature(same)).toBe(notificationSignature(base));
    for (const edited of [text, date]) {
      expect(edited.id).toBe(base.id);
      expect(notificationSignature(edited)).not.toBe(notificationSignature(base));
    }
    expect(notificationSignature(base)).not.toContain(base.id);
  });

  it('summarizes overdue todos once at the next morning', () => {
    const t = [
      todo('a', { dueDate: '2026-06-01', text: 'One' }),
      todo('b', { dueDate: '2026-06-02', text: 'Two' }),
      todo('c', { dueDate: '2026-06-03', text: 'Three' }),
      todo('d', { dueDate: '2026-06-04', text: 'Four' }),
    ];
    const out = planNotifications(t, [], on(), NOW, BERLIN);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'kh:overdue:2026-06-10',
      kind: 'overdue',
      title: '4 overdue todos',
      body: 'One, Two, Three +1 more',
      url: 'kaihuman://board',
      fireAt: Date.UTC(2026, 5, 10, 7),
    });
    expect(first(out).todoId).toBeUndefined();
  });

  it('overdue uses singular, tomorrow when morning passed, and counts timed todos', () => {
    const now = Date.UTC(2026, 5, 10, 10); // after 09:00 Berlin
    const t = [todo('a', { dueDate: '2026-06-10', dueTime: '08:00' })];
    const out = planNotifications(t, [], on(), now, BERLIN);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'kh:overdue:2026-06-11',
      title: '1 overdue todo',
      body: 'Todo a',
      fireAt: Date.UTC(2026, 5, 11, 7),
    });
  });

  it('does not treat a date-only todo due today as overdue', () => {
    const t = [todo('a', { dueDate: '2026-06-10' })];
    expect(planNotifications(t, [], on(), NOW - 3_600_000, BERLIN).map((n) => n.kind)).toEqual([
      'due-today',
    ]);
  });

  it('plans milestone-tomorrow only when open > 0', () => {
    const ms = [
      { id: 'm 1', name: 'Launch', dueDate: '2026-06-12', open: 3 },
      { id: 'm2', name: 'Quiet', dueDate: '2026-06-12', open: 0 },
      { id: 'm3', name: 'Undated', open: 2 },
    ];
    const out = planNotifications([], ms, on(), NOW, BERLIN);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'kh:milestone-tomorrow:m 1',
      kind: 'milestone-tomorrow',
      title: 'Due tomorrow: Launch',
      body: '3 open todos',
      fireAt: Date.UTC(2026, 5, 11, 7),
      url: 'kaihuman://board?milestone=m%201',
    });
    const one = planNotifications(
      [],
      [{ id: 'm 1', name: 'Launch', dueDate: '2026-06-12', open: 1 }],
      on(),
      NOW,
      BERLIN,
    );
    expect(first(one).body).toBe('1 open todo');
  });

  it('digest wording and body', () => {
    const t = [
      todo('a', { dueDate: '2026-06-11', text: 'A' }),
      todo('b', { dueDate: '2026-06-11', dueTime: '10:00', text: 'B' }),
      todo('c', { dueDate: '2026-06-11', text: 'C' }),
      todo('d', { dueDate: '2026-06-11', text: 'D' }),
      todo('e', { dueDate: '2026-06-12', text: 'E' }),
    ];
    const out = planNotifications(t, [], on({ digest: true }), NOW, BERLIN).filter(
      (n) => n.kind === 'digest',
    );
    expect(out.map((n) => [n.id, n.title, n.body, n.url])).toEqual([
      ['kh:digest:2026-06-11', '4 todos due today', 'A, B, C', 'kaihuman://board'],
      ['kh:digest:2026-06-12', '1 todo due today', 'E', 'kaihuman://board'],
    ]);
  });

  it('digest still emits due-today items', () => {
    const t = [todo('a', { dueDate: '2026-06-11' })];
    const kinds = planNotifications(t, [], on({ digest: true }), NOW, BERLIN).map((n) => n.kind);
    expect(kinds).toContain('digest');
    expect(kinds).toContain('due-today');
  });

  it('respects per-kind toggles', () => {
    const t = [
      todo('a', { dueDate: '2026-06-11' }),
      todo('b', { dueDate: '2026-06-11', dueTime: '10:00' }),
      todo('c', { dueDate: '2026-06-01' }),
    ];
    const ms = [{ id: 'm', name: 'M', dueDate: '2026-06-12', open: 1 }];
    const kinds = { dueToday: false, dueSoon: false, overdue: false, milestoneTomorrow: false };
    expect(planNotifications(t, ms, on({ kinds }), NOW, BERLIN)).toEqual([]);
    for (const [key, kind] of [
      ['dueToday', 'due-today'],
      ['dueSoon', 'due-soon'],
      ['overdue', 'overdue'],
      ['milestoneTomorrow', 'milestone-tomorrow'],
    ] as const) {
      const out = planNotifications(t, ms, on({ kinds: { ...kinds, [key]: true } }), NOW, BERLIN);
      expect(new Set(out.map((n) => n.kind))).toEqual(new Set([kind]));
    }
  });

  it('excludes past fireAt and anything beyond the 7 day horizon', () => {
    const t = [
      todo('past', { dueDate: '2026-06-10' }), // 09:00 Berlin = 07:00Z
      todo('edge', { dueDate: '2026-06-17' }),
      todo('far', { dueDate: '2026-06-18' }),
    ];
    const now = Date.UTC(2026, 5, 10, 8);
    const out = planNotifications(t, [], on(), now, BERLIN);
    expect(out.map((n) => n.id)).toEqual(['kh:due-today:edge']);
    expect(out.every((n) => n.fireAt > now)).toBe(true);
  });

  it('caps at the limit keeping the nearest, sorted', () => {
    expect(IOS_PENDING_LIMIT).toBe(64);
    const t = Array.from({ length: 100 }, (_, i) =>
      todo(`t${String(i).padStart(3, '0')}`, { dueDate: i % 2 ? '2026-06-12' : '2026-06-11' }),
    );
    const out = planNotifications(t, [], on(), NOW, BERLIN);
    expect(out).toHaveLength(64);
    expect(out.slice(0, 50).every((n) => n.fireAt === Date.UTC(2026, 5, 11, 7))).toBe(true);
    const sorted = [...out].sort((a, b) => a.fireAt - b.fireAt || (a.id < b.id ? -1 : 1));
    expect(out).toEqual(sorted);
    expect(planNotifications(t, [], on(), NOW, BERLIN, 5)).toHaveLength(5);
  });

  it('is deterministic regardless of input order', () => {
    const t = [todo('a', { dueDate: '2026-06-11' }), todo('b', { dueDate: '2026-06-11' })];
    expect(planNotifications([...t].reverse(), [], on(), NOW, BERLIN)).toEqual(
      planNotifications(t, [], on(), NOW, BERLIN),
    );
  });
});
