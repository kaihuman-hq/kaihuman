import { describe, expect, it } from 'vitest';
import {
  anchorRepeat,
  describeRepeat,
  formatRepeat,
  nextOccurrenceDate,
  parseRepeat,
  type TodoRepeat,
} from './todo-repeat.js';

const next = (date: string, rule: string, after?: string) =>
  nextOccurrenceDate(date, parseRepeat(rule) as TodoRepeat, after);

/** Successive occurrences, each computed from the previous one (as completing does). */
const chain = (date: string, rule: string, count: number): string[] => {
  const repeat = anchorRepeat(parseRepeat(rule) as TodoRepeat, date);
  const out: string[] = [];
  let d = date;
  for (let i = 0; i < count; i++) {
    d = nextOccurrenceDate(d, repeat);
    out.push(d);
  }
  return out;
};

describe('parseRepeat / formatRepeat', () => {
  it.each([
    ['daily', { unit: 'day', interval: 1 }],
    ['weekdays', { unit: 'week', interval: 1, weekdays: [0, 1, 2, 3, 4] }],
    ['weekly', { unit: 'week', interval: 1 }],
    ['weekly:mon,thu', { unit: 'week', interval: 1, weekdays: [0, 3] }],
    ['monthly', { unit: 'month', interval: 1 }],
    ['monthly:15', { unit: 'month', interval: 1, day: 15 }],
    ['monthly:last', { unit: 'month', interval: 1, day: 'last' }],
    ['yearly', { unit: 'year', interval: 1 }],
    ['yearly:02-29', { unit: 'year', interval: 1, date: '02-29' }],
    ['every 3 days', { unit: 'day', interval: 3 }],
    ['every 2 weeks:fri', { unit: 'week', interval: 2, weekdays: [4] }],
    ['every 6 months:31', { unit: 'month', interval: 6, day: 31 }],
    ['every 2 years', { unit: 'year', interval: 2 }],
  ])('round-trips %s', (text, rule) => {
    expect(parseRepeat(text)).toEqual(rule);
    expect(formatRepeat(rule as TodoRepeat)).toBe(text);
  });

  it('normalises equivalent spellings', () => {
    expect(formatRepeat(parseRepeat('Every 1 Day') as TodoRepeat)).toBe('daily');
    expect(formatRepeat(parseRepeat('every 1 weeks:fri,mon,fri') as TodoRepeat)).toBe(
      'weekly:mon,fri',
    );
    expect(formatRepeat(parseRepeat('weekly:mon,tue,wed,thu,fri') as TodoRepeat)).toBe('weekdays');
  });

  it.each([
    '',
    'hourly',
    'every day',
    'every 0 days',
    'every 1000 days',
    'weekly:funday',
    'monthly:32',
    'monthly:0',
    'yearly:02-30',
    'yearly:13-01',
    'daily:mon',
    'weekdays:mon',
  ])('rejects %j', (text) => {
    expect(parseRepeat(text)).toBeUndefined();
  });

  it('describes rules in English', () => {
    expect(describeRepeat(parseRepeat('weekdays') as TodoRepeat)).toBe('Every weekday');
    expect(describeRepeat(parseRepeat('every 2 weeks:mon,thu') as TodoRepeat)).toBe(
      'Every 2 weeks on Mon, Thu',
    );
    expect(describeRepeat(parseRepeat('monthly:last') as TodoRepeat)).toBe(
      'Monthly on the last day',
    );
    expect(describeRepeat(parseRepeat('monthly:22') as TodoRepeat)).toBe('Monthly on the 22nd');
    expect(describeRepeat(parseRepeat('monthly:11') as TodoRepeat)).toBe('Monthly on the 11th');
    expect(describeRepeat(parseRepeat('yearly:02-29') as TodoRepeat)).toBe('Yearly on Feb 29');
    expect(describeRepeat(parseRepeat('daily') as TodoRepeat)).toBe('Daily');
  });
});

describe('nextOccurrenceDate', () => {
  it('steps days and weeks from the due date', () => {
    expect(next('2026-11-09', 'daily')).toBe('2026-11-10');
    expect(next('2026-11-09', 'every 3 days')).toBe('2026-11-12');
    expect(next('2026-11-09', 'weekly')).toBe('2026-11-16');
    expect(next('2026-12-31', 'daily')).toBe('2027-01-01');
  });

  it('skips missed occurrences but stays on the cycle', () => {
    // Due Nov 1, completed Nov 9: every 3 days from Nov 1 -> Nov 10.
    expect(next('2026-11-01', 'every 3 days', '2026-11-09')).toBe('2026-11-10');
    expect(next('2026-11-01', 'daily', '2026-11-09')).toBe('2026-11-10');
    expect(next('2026-10-05', 'weekly', '2026-11-09')).toBe('2026-11-16');
  });

  it('completing early moves past the current due date', () => {
    expect(next('2026-11-12', 'daily', '2026-11-09')).toBe('2026-11-13');
  });

  it('handles weekday lists and intervals', () => {
    // 2026-11-09 is a Monday.
    expect(next('2026-11-09', 'weekly:mon,thu')).toBe('2026-11-12');
    expect(next('2026-11-12', 'weekly:mon,thu')).toBe('2026-11-16');
    expect(next('2026-11-13', 'weekdays')).toBe('2026-11-16'); // Fri -> Mon
    expect(next('2026-11-09', 'every 2 weeks:mon,thu')).toBe('2026-11-12');
    expect(next('2026-11-12', 'every 2 weeks:mon,thu')).toBe('2026-11-23');
    expect(next('2026-11-09', 'every 2 weeks:mon', '2026-11-30')).toBe('2026-12-07');
  });

  it('clamps month ends without drifting', () => {
    expect(chain('2026-01-31', 'monthly', 4)).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(chain('2027-11-30', 'monthly:last', 4)).toEqual([
      '2027-12-31',
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ]);
    expect(next('2026-11-09', 'monthly:15')).toBe('2026-11-15');
    expect(next('2026-11-20', 'monthly:15')).toBe('2026-12-15');
    expect(next('2026-08-31', 'every 6 months:31')).toBe('2027-02-28');
    expect(next('2026-12-15', 'monthly')).toBe('2027-01-15');
  });

  it('handles leap years', () => {
    expect(chain('2024-02-29', 'yearly', 5)).toEqual([
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
      '2029-02-28',
    ]);
    expect(next('2028-02-28', 'daily')).toBe('2028-02-29');
    expect(next('2027-02-28', 'daily')).toBe('2027-03-01');
    expect(next('2024-02-29', 'every 4 years')).toBe('2028-02-29');
    expect(next('2026-03-01', 'yearly:02-29')).toBe('2027-02-28');
  });

  it('is not affected by daylight-saving changes', () => {
    // EU and US DST transitions; local-midnight arithmetic would skip or repeat a day here.
    expect(next('2026-03-28', 'daily')).toBe('2026-03-29');
    expect(next('2026-03-29', 'daily')).toBe('2026-03-30');
    expect(next('2026-10-24', 'daily')).toBe('2026-10-25');
    expect(next('2026-10-25', 'daily')).toBe('2026-10-26');
    expect(next('2026-03-07', 'weekly')).toBe('2026-03-14');
    expect(next('2026-10-31', 'every 2 days')).toBe('2026-11-02');
  });

  it('pins month and year rules to the due day', () => {
    expect(formatRepeat(anchorRepeat(parseRepeat('monthly') as TodoRepeat, '2026-01-31'))).toBe(
      'monthly:31',
    );
    expect(formatRepeat(anchorRepeat(parseRepeat('yearly') as TodoRepeat, '2024-02-29'))).toBe(
      'yearly:02-29',
    );
    expect(formatRepeat(anchorRepeat(parseRepeat('monthly:5') as TodoRepeat, '2026-01-31'))).toBe(
      'monthly:5',
    );
    expect(formatRepeat(anchorRepeat(parseRepeat('daily') as TodoRepeat, '2026-01-31'))).toBe(
      'daily',
    );
  });
});
