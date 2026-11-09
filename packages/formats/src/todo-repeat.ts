/**
 * Recurrence rules for todos: the `::repeat::` value on a todo's metadata line.
 *
 * Grammar (`<on>` is optional and depends on the unit):
 *   daily | weekdays | weekly | monthly | yearly | every <N> day(s)|week(s)|month(s)|year(s)
 *   followed by `:<on>`:
 *     weeks  -> weekday list, e.g. `weekly:mon,thu`, `every 2 weeks:fri`
 *     months -> day of month 1-31 or `last`, e.g. `monthly:15`, `monthly:last`
 *     years  -> MM-DD, e.g. `yearly:02-29`
 *
 * Dates are local calendar strings (`YYYY-MM-DD`) and the arithmetic runs on UTC midnights, so
 * daylight-saving shifts can never skip or repeat a day. A due time is carried over unchanged:
 * it is a wall-clock time, so a 09:00 daily todo stays at 09:00 across DST changes.
 */

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';
/** 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TodoRepeat =
  | { unit: 'day'; interval: number }
  | { unit: 'week'; interval: number; weekdays?: Weekday[] }
  | { unit: 'month'; interval: number; day?: number | 'last' }
  | { unit: 'year'; interval: number; date?: string /* MM-DD */ };

export const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WORKDAYS: Weekday[] = [0, 1, 2, 3, 4];
const BASE: Record<string, { unit: RepeatUnit; weekdays?: Weekday[] }> = {
  daily: { unit: 'day' },
  weekdays: { unit: 'week', weekdays: WORKDAYS },
  weekly: { unit: 'week' },
  monthly: { unit: 'month' },
  yearly: { unit: 'year' },
};
const SINGLE: Record<RepeatUnit, string> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};
export const MAX_REPEAT_INTERVAL = 999;

const pad2 = (n: number): string => String(n).padStart(2, '0');

const isWeekdayList = (list: Weekday[]): boolean =>
  list.length === WORKDAYS.length && WORKDAYS.every((d, i) => list[i] === d);

function parseOn(unit: RepeatUnit, on: string): Partial<TodoRepeat> | undefined {
  if (unit === 'week') {
    const days = on.split(',').map((s) => WEEKDAY_NAMES.indexOf(s.trim() as 'mon'));
    if (days.some((d) => d < 0)) return undefined;
    return { weekdays: [...new Set(days as Weekday[])].sort((a, b) => a - b) };
  }
  if (unit === 'month') {
    if (on === 'last') return { day: 'last' };
    if (!/^\d{1,2}$/.test(on) || Number(on) < 1 || Number(on) > 31) return undefined;
    return { day: Number(on) };
  }
  if (unit === 'year') {
    const m = on.match(/^(\d{2})-(\d{2})$/);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return undefined;
    if (Number(m[2]) < 1 || Number(m[2]) > daysInMonth(2000, Number(m[1]))) return undefined;
    return { date: on };
  }
  return undefined;
}

/** Parse a `::repeat::` value; unknown or malformed rules are undefined. */
export const parseRepeat = (value: string): TodoRepeat | undefined => {
  const v = value.trim().toLowerCase();
  const m = v.match(
    /^(?:(daily|weekdays|weekly|monthly|yearly)|every\s+(\d+)\s+(day|week|month|year)s?)(?::(\S+))?$/,
  );
  if (!m) return undefined;
  const named = m[1] ? BASE[m[1]] : undefined;
  const unit = named?.unit ?? (m[3] as RepeatUnit);
  const interval = named ? 1 : Number(m[2]);
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_REPEAT_INTERVAL)
    return undefined;
  if (m[1] === 'weekdays' && m[4]) return undefined;
  const on = m[4] ? parseOn(unit, m[4]) : named?.weekdays ? { weekdays: named.weekdays } : {};
  if (!on) return undefined;
  return { unit, interval, ...on } as TodoRepeat;
};

/** Canonical `::repeat::` value; `parseRepeat(formatRepeat(r))` gives `r` back. */
export const formatRepeat = (r: TodoRepeat): string => {
  if (r.unit === 'week' && r.interval === 1 && r.weekdays && isWeekdayList(r.weekdays)) {
    return 'weekdays';
  }
  const base =
    r.interval === 1 ? SINGLE[r.unit] : `every ${r.interval} ${r.unit}${r.interval > 1 ? 's' : ''}`;
  let on: string | undefined;
  if (r.unit === 'week' && r.weekdays?.length)
    on = r.weekdays.map((d) => WEEKDAY_NAMES[d]).join(',');
  if (r.unit === 'month' && r.day !== undefined) on = String(r.day);
  if (r.unit === 'year' && r.date) on = r.date;
  return on ? `${base}:${on}` : base;
};

const UNIT_LABEL: Record<RepeatUnit, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};
const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABEL = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Short English label for lists and editors, e.g. "Every 2 weeks on Mon, Thu". */
export const describeRepeat = (r: TodoRepeat): string => {
  if (formatRepeat(r) === 'weekdays') return 'Every weekday';
  const every =
    r.interval === 1
      ? { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[r.unit]
      : `Every ${r.interval} ${UNIT_LABEL[r.unit]}s`;
  if (r.unit === 'week' && r.weekdays?.length) {
    return `${every} on ${r.weekdays.map((d) => DAY_LABEL[d]).join(', ')}`;
  }
  if (r.unit === 'month' && r.day !== undefined) {
    return `${every} on the ${r.day === 'last' ? 'last day' : ordinal(r.day)}`;
  }
  if (r.unit === 'year' && r.date) {
    const [mm, dd] = r.date.split('-').map(Number) as [number, number];
    return `${every} on ${MONTH_LABEL[mm - 1]} ${dd}`;
  }
  return every;
};

const ordinal = (n: number): string => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
};

// ─── Calendar arithmetic on YYYY-MM-DD ───────────────────────────────────────

const DAY_MS = 86_400_000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const toUtc = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

const fromUtc = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

const addDays = (date: string, days: number): string => fromUtc(toUtc(date) + days * DAY_MS);

/** Monday = 0. */
const weekdayOf = (date: string): Weekday =>
  ((new Date(toUtc(date)).getUTCDay() + 6) % 7) as Weekday;

/** `year`/`month` (1-12) with `day` clamped to the month's length; `last` is the final day. */
const clampedDate = (year: number, month: number, day: number | 'last'): string => {
  const max = daysInMonth(year, month);
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day === 'last' ? max : Math.min(day, max))}`;
};

/**
 * The first occurrence of `repeat` strictly after both `date` and `after` (YYYY-MM-DD).
 * `date` is the current due date and anchors the cycle: weeks and months are counted from it.
 */
export const nextOccurrenceDate = (date: string, repeat: TodoRepeat, after = date): string => {
  const ref = after > date ? after : date;
  const n = repeat.interval;
  if (repeat.unit === 'day' || (repeat.unit === 'week' && !repeat.weekdays?.length)) {
    const step = repeat.unit === 'day' ? n : 7 * n;
    const diff = Math.round((toUtc(ref) - toUtc(date)) / DAY_MS);
    return addDays(date, (Math.floor(diff / step) + 1) * step);
  }
  if (repeat.unit === 'week') {
    const days = new Set(repeat.weekdays);
    const weekStart = toUtc(addDays(date, -weekdayOf(date)));
    // Jump to the cycle week containing `ref`, then scan at most two cycles day by day.
    for (let i = 1; i <= 14 * n + 7; i++) {
      const candidate = addDays(ref, i);
      const week = Math.floor((toUtc(candidate) - weekStart) / (7 * DAY_MS));
      if (week % n === 0 && days.has(weekdayOf(candidate))) return candidate;
    }
    throw new Error('unreachable: a weekly rule always has a next day');
  }
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  if (repeat.unit === 'month') {
    const day = repeat.day ?? d;
    const refY = Number(ref.slice(0, 4));
    const refM = Number(ref.slice(5, 7));
    const monthsAhead = (refY - y) * 12 + (refM - m);
    for (let k = Math.max(0, Math.floor(monthsAhead / n)); ; k++) {
      const total = m - 1 + k * n;
      const candidate = clampedDate(y + Math.floor(total / 12), (total % 12) + 1, day);
      if (candidate > ref) return candidate;
    }
  }
  const [mm, dd] = repeat.date ? (repeat.date.split('-').map(Number) as [number, number]) : [m, d];
  const refY = Number(ref.slice(0, 4));
  for (let k = Math.max(0, Math.floor((refY - y) / n)); ; k++) {
    const candidate = clampedDate(y + k * n, mm, dd);
    if (candidate > ref) return candidate;
  }
};

/**
 * Pins a month or year rule to the due date's day, so clamping (Jan 31 -> Feb 28, Feb 29 ->
 * Feb 28) does not drift the following occurrences. Other rules come back unchanged.
 */
export const anchorRepeat = (repeat: TodoRepeat, date: string): TodoRepeat => {
  if (repeat.unit === 'month' && repeat.day === undefined) {
    return { ...repeat, day: Number(date.slice(8, 10)) };
  }
  if (repeat.unit === 'year' && !repeat.date) return { ...repeat, date: date.slice(5, 10) };
  return repeat;
};
