import { describe, expect, it } from 'vitest';
import { nextBirthdays } from './widget-birthdays.js';

const csv = (...rows: string[]) => `name;type;start iso date;end iso date\n${rows.join('\n')}\n`;

describe('nextBirthdays', () => {
  it('lists upcoming birthdays soonest first with the age being turned', () => {
    const c = csv('Anna;birthday;1990-12-24;1990-12-24', 'Mum;birthday;1960-11-20;1960-11-20');
    expect(nextBirthdays(c, '2026-11-18')).toEqual([
      { name: 'Mum', date: '2026-11-20', turns: 66 },
      { name: 'Anna', date: '2026-12-24', turns: 36 },
    ]);
  });

  it('counts today and rolls a passed birthday into next year', () => {
    const c = csv('Today;birthday;2000-11-18;2000-11-18', 'Past;birthday;2000-11-17;2000-11-17');
    expect(nextBirthdays(c, '2026-11-18')).toEqual([
      { name: 'Today', date: '2026-11-18', turns: 26 },
      { name: 'Past', date: '2027-11-17', turns: 27 },
    ]);
  });

  it('wraps the year at the end of December', () => {
    const c = csv('Jan;birthday;1985-01-02;1985-01-02');
    expect(nextBirthdays(c, '2026-12-31')).toEqual([
      { name: 'Jan', date: '2027-01-02', turns: 42 },
    ]);
  });

  it('moves a 29 February birthday to 28 February in non-leap years', () => {
    const c = csv('Leap;birthday;2000-02-29;2000-02-29');
    expect(nextBirthdays(c, '2026-11-18')[0]?.date).toBe('2027-02-28');
    expect(nextBirthdays(c, '2027-03-01')[0]?.date).toBe('2028-02-29');
    expect(nextBirthdays(c, '2028-02-29')[0]?.date).toBe('2028-02-29');
  });

  it('omits the age for a missing or placeholder birth year', () => {
    const c = csv('Unknown;birthday;1900-12-01;1900-12-01', 'Baby;birthday;2026-12-02;2026-12-02');
    expect(nextBirthdays(c, '2026-11-18')).toEqual([
      { name: 'Unknown', date: '2026-12-01' },
      { name: 'Baby', date: '2026-12-02' },
    ]);
  });

  it('takes general events titled birthday or Geburtstag, once', () => {
    const c = csv(
      'Omas Geburtstag;general;2026-12-05;2026-12-05',
      'Party;general;2026-12-06;2026-12-06',
      'Old birthday bash;general;2025-12-05;2025-12-05',
    );
    expect(nextBirthdays(c, '2026-11-18')).toEqual([
      { name: 'Omas Geburtstag', date: '2026-12-05' },
    ]);
  });

  it('skips malformed rows, honours the limit and bad input', () => {
    const c = csv(
      'Bad;birthday;nope;nope',
      'Feb30;birthday;1990-02-30;1990-02-30',
      'A;birthday;1990-12-01;x',
      'B;birthday;1990-12-02;x',
    );
    expect(nextBirthdays(c, '2026-11-18', 1).map((b) => b.name)).toEqual(['A']);
    expect(nextBirthdays(c, 'garbage')).toEqual([]);
    expect(nextBirthdays('', '2026-11-18')).toEqual([]);
  });
});
