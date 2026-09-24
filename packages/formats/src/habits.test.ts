import { describe, expect, it } from 'vitest';
import { calculateStats, checkIn, isCheckedIn, parseHabitData } from './habits.js';

const NOW = new Date(2026, 8, 23, 10, 30);
const CSV = ['iso date;goal reached', '2026-09-19;x', '2026-09-21;x', '2026-09-22;x'].join('\n');

describe('habits', () => {
  it('counts the streak from yesterday until today is checked in', () => {
    const streak = (csv: string) => calculateStats(parseHabitData(csv), NOW).currentStreak;
    expect(streak(CSV)).toBe(2);
    expect(streak(checkIn(CSV, '2026-09-23'))).toBe(3);
    expect(streak('iso date;goal reached\n2026-09-10;x')).toBe(0);
  });

  it('checks in sorted, header first, no trailing newline, a day only once', () => {
    expect(checkIn('iso date;goal reached\n2026-09-22;x\n', '2026-09-21')).toBe(
      'iso date;goal reached\n2026-09-21;x\n2026-09-22;x',
    );
    expect(checkIn(CSV, '2026-09-22').match(/2026-09-22/g)).toHaveLength(1);
    expect(isCheckedIn(CSV, '2026-09-22')).toBe(true);
    expect(isCheckedIn(CSV, '2026-09-23')).toBe(false);
  });
});
