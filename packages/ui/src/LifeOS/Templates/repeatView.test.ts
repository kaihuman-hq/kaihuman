import type { TodoRepeat } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  buildRepeat,
  clampInterval,
  NO_REPEAT,
  presetOf,
  type RepeatState,
  stateOf,
  toggleWeekday,
  weekdayOf,
} from './repeatView';

const TUE = '2026-11-10'; // a Tuesday

describe('weekdayOf', () => {
  it('is 0 for Monday and 6 for Sunday', () => {
    expect(weekdayOf('2026-11-09')).toBe(0);
    expect(weekdayOf(TUE)).toBe(1);
    expect(weekdayOf('2026-11-15')).toBe(6);
  });
});

describe('presetOf', () => {
  it('maps rules to presets', () => {
    expect(presetOf(undefined)).toBe('none');
    expect(presetOf({ unit: 'day', interval: 1 })).toBe('daily');
    expect(presetOf({ unit: 'week', interval: 1, weekdays: [0, 1, 2, 3, 4] })).toBe('weekdays');
    expect(presetOf({ unit: 'week', interval: 1 }, TUE)).toBe('weekly');
    expect(presetOf({ unit: 'week', interval: 1, weekdays: [1] }, TUE)).toBe('weekly');
    expect(presetOf({ unit: 'month', interval: 1, day: 10 }, TUE)).toBe('monthly');
    expect(presetOf({ unit: 'year', interval: 1 }, TUE)).toBe('yearly');
  });
  it('treats everything else as custom', () => {
    expect(presetOf({ unit: 'day', interval: 3 })).toBe('custom');
    expect(presetOf({ unit: 'week', interval: 1, weekdays: [0, 3] }, TUE)).toBe('custom');
    expect(presetOf({ unit: 'week', interval: 1, weekdays: [4] }, TUE)).toBe('custom');
    expect(presetOf({ unit: 'month', interval: 1, day: 'last' }, TUE)).toBe('custom');
    expect(presetOf({ unit: 'month', interval: 1, day: 15 }, TUE)).toBe('custom');
  });
});

describe('buildRepeat', () => {
  const state = (over: Partial<RepeatState>): RepeatState => ({ ...NO_REPEAT, ...over });
  it('is undefined without a due date or with no repeat', () => {
    expect(buildRepeat(state({ preset: 'daily' }), undefined)).toBeUndefined();
    expect(buildRepeat(NO_REPEAT, TUE)).toBeUndefined();
  });
  it('defaults weekly and monthly to the due date', () => {
    expect(buildRepeat(state({ preset: 'weekly' }), TUE)).toEqual({
      unit: 'week',
      interval: 1,
      weekdays: [1],
    });
    expect(buildRepeat(state({ preset: 'monthly' }), TUE)).toEqual({
      unit: 'month',
      interval: 1,
      day: 10,
    });
  });
  it('builds custom rules', () => {
    expect(buildRepeat(state({ preset: 'custom', unit: 'day', interval: 3 }), TUE)).toEqual({
      unit: 'day',
      interval: 3,
    });
    expect(
      buildRepeat(state({ preset: 'custom', unit: 'week', interval: 2, weekdays: [3, 0] }), TUE),
    ).toEqual({ unit: 'week', interval: 2, weekdays: [0, 3] });
    expect(buildRepeat(state({ preset: 'custom', unit: 'week', interval: 2 }), TUE)).toEqual({
      unit: 'week',
      interval: 2,
      weekdays: [1],
    });
    expect(buildRepeat(state({ preset: 'custom', unit: 'year', interval: 0 }), TUE)).toEqual({
      unit: 'year',
      interval: 1,
    });
  });
  it('round-trips existing rules, keeping a month day or year date', () => {
    const rules: TodoRepeat[] = [
      { unit: 'month', interval: 2, day: 'last' },
      { unit: 'year', interval: 1, date: '02-29' },
      { unit: 'week', interval: 2, weekdays: [0, 3] },
      { unit: 'day', interval: 1 },
    ];
    for (const rule of rules) expect(buildRepeat(stateOf(rule, TUE), TUE)).toEqual(rule);
  });
});

describe('helpers', () => {
  it('clamps intervals', () => {
    expect(clampInterval(0)).toBe(1);
    expect(clampInterval(2.7)).toBe(2);
    expect(clampInterval(5000)).toBe(999);
    expect(clampInterval(Number.NaN)).toBe(1);
  });
  it('toggles weekdays but keeps at least one', () => {
    expect(toggleWeekday([0], 3)).toEqual([0, 3]);
    expect(toggleWeekday([0, 3], 3)).toEqual([0]);
    expect(toggleWeekday([0], 0)).toEqual([0]);
  });
});
