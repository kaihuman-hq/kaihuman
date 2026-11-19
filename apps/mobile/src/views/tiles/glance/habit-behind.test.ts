import { describe, expect, it } from 'vitest';
import { habitBehind } from './habit-behind.js';

// Thursday 2026-11-05, 10:00 local.
const now = new Date(2026, 10, 5, 10, 0, 0);
const csv = (...days: string[]) =>
  ['iso date;goal reached', ...days.map((d) => `${d};x`)].join('\n');

describe('habitBehind', () => {
  it('is 0 behind when yesterday is checked in, whether or not today is', () => {
    expect(habitBehind(csv('2026-11-03', '2026-11-04'), now)).toEqual({ behind: 0, catchUp: [] });
    expect(habitBehind(csv('2026-11-04', '2026-11-05'), now)).toEqual({ behind: 0, catchUp: [] });
  });

  it('is 1 behind when only yesterday was missed', () => {
    expect(habitBehind(csv('2026-11-02', '2026-11-03'), now)).toEqual({
      behind: 1,
      catchUp: ['2026-11-04'],
    });
  });

  it('offers yesterday and the day before when both were missed', () => {
    expect(habitBehind(csv('2026-11-01', '2026-11-02'), now)).toEqual({
      behind: 2,
      catchUp: ['2026-11-03', '2026-11-04'],
    });
  });

  it('keeps counting beyond 2 days but only offers the last 2 to catch up', () => {
    expect(habitBehind(csv('2026-10-28'), now)).toEqual({
      behind: 7,
      catchUp: ['2026-11-03', '2026-11-04'],
    });
  });

  it('still offers a missed day before a checked yesterday', () => {
    expect(habitBehind(csv('2026-11-02', '2026-11-04'), now)).toEqual({
      behind: 0,
      catchUp: ['2026-11-03'],
    });
  });

  it('ignores days before the first check-in and empty files', () => {
    expect(habitBehind(csv('2026-11-04'), now)).toEqual({ behind: 0, catchUp: [] });
    expect(habitBehind(csv('2026-11-03'), now)).toEqual({ behind: 1, catchUp: ['2026-11-04'] });
    expect(habitBehind('iso date;goal reached', now)).toEqual({ behind: 0, catchUp: [] });
    expect(habitBehind('', now)).toEqual({ behind: 0, catchUp: [] });
  });

  it('counts a day with an unticked row as missed', () => {
    const c = 'iso date;goal reached\n2026-11-03;x\n2026-11-04;';
    expect(habitBehind(c, now)).toEqual({ behind: 1, catchUp: ['2026-11-04'] });
  });
});
