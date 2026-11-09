import {
  MAX_REPEAT_INTERVAL,
  type RepeatUnit,
  type TodoRepeat,
  type Weekday,
} from '@kaihuman/formats';

export type RepeatPreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

export const REPEAT_PRESETS: { value: RepeatPreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom…' },
];

export const REPEAT_UNITS: { value: RepeatUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
];

/** Editor state: what the controls show. `base` is the rule being edited, kept so a custom rule's
 * month day / year date survives an edit that does not touch it. */
export interface RepeatState {
  preset: RepeatPreset;
  interval: number;
  unit: RepeatUnit;
  weekdays: Weekday[];
  base?: TodoRepeat;
}

export const NO_REPEAT: RepeatState = { preset: 'none', interval: 1, unit: 'week', weekdays: [] };

const WORKDAYS: Weekday[] = [0, 1, 2, 3, 4];

/** 0 = Monday … 6 = Sunday for a `YYYY-MM-DD` date. */
export const weekdayOf = (date: string): Weekday =>
  ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) as Weekday;

const dayOf = (date: string): number => Number(date.slice(8, 10));

export const clampInterval = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_REPEAT_INTERVAL, Math.max(1, Math.trunc(n))) : 1;

const sameDays = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((d, i) => d === b[i]);

/** Which preset describes `repeat` for a todo due on `date` (anything else is custom). */
export const presetOf = (repeat: TodoRepeat | undefined, date?: string): RepeatPreset => {
  if (!repeat) return 'none';
  if (repeat.interval !== 1) return 'custom';
  switch (repeat.unit) {
    case 'day':
      return 'daily';
    case 'week': {
      const days = repeat.weekdays;
      if (days && sameDays(days, WORKDAYS)) return 'weekdays';
      if (!days || (days.length === 1 && (!date || days[0] === weekdayOf(date)))) return 'weekly';
      return 'custom';
    }
    case 'month':
      return repeat.day === undefined || (!!date && repeat.day === dayOf(date))
        ? 'monthly'
        : 'custom';
    case 'year':
      return repeat.date === undefined || (!!date && repeat.date === date.slice(5, 10))
        ? 'yearly'
        : 'custom';
  }
};

export const stateOf = (repeat: TodoRepeat | undefined, date?: string): RepeatState => {
  if (!repeat) return NO_REPEAT;
  return {
    preset: presetOf(repeat, date),
    interval: repeat.interval,
    unit: repeat.unit,
    weekdays: repeat.unit === 'week' ? [...(repeat.weekdays ?? [])] : [],
    base: repeat,
  };
};

/**
 * The rule for the editor state and due date. Weekly and monthly follow the due date's weekday
 * and day of month, so changing the date in the form keeps them consistent. No due date, no rule.
 */
export const buildRepeat = (
  state: RepeatState,
  date: string | undefined,
): TodoRepeat | undefined => {
  if (!date || state.preset === 'none') return undefined;
  switch (state.preset) {
    case 'daily':
      return { unit: 'day', interval: 1 };
    case 'weekdays':
      return { unit: 'week', interval: 1, weekdays: [...WORKDAYS] };
    case 'weekly':
      return { unit: 'week', interval: 1, weekdays: [weekdayOf(date)] };
    case 'monthly':
      return { unit: 'month', interval: 1, day: dayOf(date) };
    case 'yearly':
      return { unit: 'year', interval: 1 };
    case 'custom': {
      const interval = clampInterval(state.interval);
      const base = state.base;
      if (state.unit === 'day') return { unit: 'day', interval };
      if (state.unit === 'week') {
        const weekdays = [...new Set(state.weekdays)].sort() as Weekday[];
        return { unit: 'week', interval, weekdays: weekdays.length ? weekdays : [weekdayOf(date)] };
      }
      if (state.unit === 'month') {
        return {
          unit: 'month',
          interval,
          day: base?.unit === 'month' && base.day !== undefined ? base.day : dayOf(date),
        };
      }
      return {
        unit: 'year',
        interval,
        ...(base?.unit === 'year' && base.date ? { date: base.date } : {}),
      };
    }
  }
};

/** Toggle a weekday in the custom weekly list; the last one cannot be removed. */
export const toggleWeekday = (days: Weekday[], day: Weekday): Weekday[] => {
  if (!days.includes(day)) return [...days, day].sort() as Weekday[];
  return days.length > 1 ? days.filter((d) => d !== day) : days;
};
