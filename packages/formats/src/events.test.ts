import { describe, expect, it } from 'vitest';
import { getUpcomingEvents, parseEvents } from './events.js';

describe('getUpcomingEvents', () => {
  it('counts days from the day given, a birthday in its next year', () => {
    const data = parseEvents(
      [
        'name;type;start iso date;end iso date',
        'Offsite;general;2026-09-25;2026-09-26',
        'Over;general;2026-09-01;2026-09-02',
        'Anna;birthday;1990-09-24;1990-09-24',
      ].join('\n'),
    );
    const upcoming = getUpcomingEvents(data, 8, new Date(2026, 8, 23, 10, 30));
    expect(upcoming.map((u) => [u.entry.name, u.daysUntil, u.durationLabel])).toEqual([
      ['Anna', 1, 'TOMORROW'],
      ['Offsite', 2, 'IN 2 DAYS'],
    ]);
  });
});
