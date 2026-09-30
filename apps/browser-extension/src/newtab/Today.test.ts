import { describe, expect, it } from 'vitest';
import { dateLine, isoWeek } from './Today';

describe('isoWeek', () => {
  it('counts weeks from the one holding the year’s first Thursday', () => {
    expect(isoWeek(new Date(2026, 8, 30))).toBe(40);
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    // 2026 starts on a Thursday, so it has 53 weeks and 2027's first days still belong to it.
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
    expect(isoWeek(new Date(2027, 0, 3))).toBe(53);
    expect(isoWeek(new Date(2027, 0, 4))).toBe(1);
    // A Monday late in December can already be week 1 of the next year.
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1);
  });
});

describe('dateLine', () => {
  it('names the day and the week', () => {
    expect(dateLine(new Date(2026, 8, 30, 10, 0))).toMatch(/^Wed 30 Sept? · W40$/);
    expect(dateLine(new Date(2027, 0, 3))).toMatch(/^Sun 3 Jan · W53$/);
  });
});
