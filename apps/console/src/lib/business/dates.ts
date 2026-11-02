/** Calendar helpers on `YYYY-MM-DD` strings. All arithmetic is in UTC so DST never shifts a day. */
import { localDate } from '@kaihuman/formats';

const DAY = 86_400_000;

const toUtc = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The user's local calendar day; pages call this once and pass the result down. */
export const todayLocal = (): string => localDate(new Date());

export const quarterOf = (date: string): { year: number; q: 1 | 2 | 3 | 4 } => ({
  year: Number(date.slice(0, 4)),
  q: (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4,
});

/** ISO 8601 week, e.g. `2026-W44`; the week-year can differ from the calendar year near New Year. */
export const isoWeek = (date: string): string => {
  const ms = toUtc(date);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  const thursday = ms + (3 - weekday) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
};

export const addDays = (date: string, days: number): string => fromUtc(toUtc(date) + days * DAY);
