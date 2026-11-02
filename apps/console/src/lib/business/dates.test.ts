import { describe, expect, it } from 'vitest';
import { addDays, isoWeek, quarterOf } from './dates.js';

describe('dates', () => {
  it('finds the calendar quarter', () => {
    expect(quarterOf('2026-10-27')).toEqual({ year: 2026, q: 4 });
    expect(quarterOf('2026-03-31')).toEqual({ year: 2026, q: 1 });
    expect(quarterOf('2026-04-01')).toEqual({ year: 2026, q: 2 });
  });

  it('finds the ISO week, including year boundaries', () => {
    expect(isoWeek('2026-10-27')).toBe('2026-W44');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2024-12-30')).toBe('2025-W01');
    expect(isoWeek('2026-01-05')).toBe('2026-W02');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-27', 5)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-27', 0)).toBe('2026-10-27');
  });
});
