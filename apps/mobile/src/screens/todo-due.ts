import {
  anchorRepeat,
  describeRepeat,
  dueStatus,
  localDateString,
  MAX_REPEAT_INTERVAL,
  nextDue,
  parseDue,
  setTodoDue,
  setTodoRepeat,
  type TodoData,
  type TodoDue,
  type TodoItem,
  type TodoRepeat,
  type Weekday,
} from '@kaihuman/formats';

export type DuePreset = 'today' | 'tomorrow' | 'next-saturday' | 'next-monday';

/** Quick due choices in menu order. */
export const DUE_PRESETS: readonly { preset: DuePreset; label: string }[] = [
  { preset: 'today', label: 'Today' },
  { preset: 'tomorrow', label: 'Tomorrow' },
  { preset: 'next-saturday', label: 'Next Saturday' },
  { preset: 'next-monday', label: 'Next Monday' },
];

export interface DueBadge {
  label: string;
  tone: 'danger' | 'warning' | 'neutral';
  /** Set for a recurring todo: its rule in words, e.g. "Every 2 weeks on Mon, Thu". */
  repeat?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Nov 8"; `year` adds ", 2026". Fixed English names: the label must not depend on device locale data. */
const shortDate = (date: string, year = false): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}${year ? `, ${y}` : ''}`;
};

/** Local calendar date of `now` plus `days`; built from y/m/d so DST shifts cannot skip a day. */
const addDays = (now: Date, days: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12);

/** Days from `now` to the next `weekday` (0 = Sunday), strictly after today: 1..7. */
const daysUntil = (now: Date, weekday: number) => ((weekday - now.getDay() + 6) % 7) + 1;

const PRESET_DAYS: Record<DuePreset, (now: Date) => number> = {
  today: () => 0,
  tomorrow: () => 1,
  'next-saturday': (now) => daysUntil(now, 6),
  'next-monday': (now) => daysUntil(now, 1),
};

export const dueFromPreset = (preset: DuePreset, now: Date): TodoDue => ({
  date: localDateString(addDays(now, PRESET_DAYS[preset](now)).getTime()),
});

/** Due from a native picker value; `time` carries the hours and minutes only when given. */
export const dueFromDate = (date: Date, time?: Date): TodoDue => ({
  date: localDateString(date.getTime()),
  ...(time && { time: `${pad2(time.getHours())}:${pad2(time.getMinutes())}` }),
});

/** The native picker's value for a due; `fallback` (now) when nothing is set. */
export const dateFromDue = (due: TodoDue | undefined, fallback: Date): Date => {
  const parsed = due && parseDue(due.time ? `${due.date}T${due.time}` : due.date);
  if (!parsed) return new Date(fallback.getTime());
  const [y, m, d] = parsed.date.split('-').map(Number) as [number, number, number];
  const [h, min] = (parsed.time ?? '00:00').split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min);
};

export const dueSummary = (due: TodoDue | undefined): string =>
  due ? `${shortDate(due.date, true)}${due.time ? ` at ${due.time}` : ''}` : 'No due date';

/** Badge for a board row or tile; none for undated and finished todos. */
export const dueBadge = (
  item: Pick<TodoItem, 'dueDate' | 'dueTime' | 'status' | 'repeat'>,
  now: Date,
): DueBadge | undefined => {
  const badge = dueLabel(item, now);
  return badge && item.repeat ? { ...badge, repeat: describeRepeat(item.repeat) } : badge;
};

const dueLabel = (
  item: Pick<TodoItem, 'dueDate' | 'dueTime' | 'status'>,
  now: Date,
): DueBadge | undefined => {
  const status = dueStatus(item as TodoItem, now.getTime());
  if (!status || !item.dueDate) return undefined;
  const time = item.dueTime ? ` ${item.dueTime}` : '';
  if (status === 'overdue') {
    return { label: `Overdue · ${shortDate(item.dueDate)}${time}`, tone: 'danger' };
  }
  if (status === 'today') return { label: `Today${time}`, tone: 'warning' };
  if (item.dueDate === dueFromPreset('tomorrow', now).date) {
    return { label: `Tomorrow${time}`, tone: 'neutral' };
  }
  return { label: `${shortDate(item.dueDate)}${time}`, tone: 'neutral' };
};

/**
 * `setTodoDue` addressed by position, failing loudly: it silently ignores unknown ids and bad
 * dates. Clearing the due also clears the repeat (a rule needs a date to count from), and moving
 * it carries a rule pinned to the old date over to the new one.
 */
export const setDueOnData = (data: TodoData, index: number, due: TodoDue | undefined): TodoData => {
  const item = data.items[index];
  if (!item) throw new Error('Todo not found');
  if (due && !parseDue(due.time ? `${due.date}T${due.time}` : due.date)) {
    throw new Error('Invalid due date');
  }
  const dated = setTodoDue(data, item.id, due);
  if (!item.repeat) return dated;
  if (!due) return setTodoRepeat(dated, item.id, undefined);
  if (!item.dueDate || item.dueDate === due.date) return dated;
  return setTodoRepeat(dated, item.id, retargetRepeat(item.repeat, item.dueDate, due.date));
};

/** Sets or clears a todo's repeat by position; a rule needs a due date to count from. */
export const setRepeatOnData = (
  data: TodoData,
  index: number,
  repeat: TodoRepeat | undefined,
): TodoData => {
  const item = data.items[index];
  if (!item) throw new Error('Todo not found');
  if (!repeat) return setTodoRepeat(data, item.id, undefined);
  if (!item.dueDate) throw new Error('Set a due date first');
  if (!Number.isInteger(repeat.interval) || repeat.interval < 1) {
    throw new Error('Invalid repeat');
  }
  return setTodoRepeat(data, item.id, withRepeatInterval(repeat, repeat.interval));
};

// ─── Repeat ──────────────────────────────────────────────────────────────────

export type RepeatPreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export const REPEAT_PRESETS: readonly { value: RepeatPreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WORKDAYS: Weekday[] = [0, 1, 2, 3, 4];

/** Monday = 0, matching the format's `Weekday`. */
export const weekdayOf = (date: string): Weekday => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) as Weekday;
};

const isWorkdays = (days: readonly Weekday[] | undefined) =>
  days?.length === WORKDAYS.length && WORKDAYS.every((d, i) => days[i] === d);

/**
 * The rule a preset chip stands for, pinned to `dueDate` so it reads the same on every device:
 * Weekly on the due weekday, Monthly on the due day, Yearly on the due MM-DD.
 */
export const repeatFromPreset = (preset: RepeatPreset, dueDate: string): TodoRepeat | undefined => {
  switch (preset) {
    case 'none':
      return undefined;
    case 'daily':
      return { unit: 'day', interval: 1 };
    case 'weekdays':
      return { unit: 'week', interval: 1, weekdays: [...WORKDAYS] };
    case 'weekly':
      return { unit: 'week', interval: 1, weekdays: [weekdayOf(dueDate)] };
    case 'monthly':
      return anchorRepeat({ unit: 'month', interval: 1 }, dueDate);
    case 'yearly':
      return anchorRepeat({ unit: 'year', interval: 1 }, dueDate);
  }
};

/** The chip to highlight for a rule; custom intervals and day lists fall under their unit. */
export const repeatPreset = (rule: TodoRepeat | undefined): RepeatPreset => {
  if (!rule) return 'none';
  if (rule.unit === 'day') return 'daily';
  if (rule.unit === 'week') {
    return rule.interval === 1 && isWorkdays(rule.weekdays) ? 'weekdays' : 'weekly';
  }
  return rule.unit === 'month' ? 'monthly' : 'yearly';
};

/** The rule with its interval clamped to 1..MAX_REPEAT_INTERVAL. */
export const withRepeatInterval = (rule: TodoRepeat, interval: number): TodoRepeat => ({
  ...rule,
  interval: Math.min(MAX_REPEAT_INTERVAL, Math.max(1, Math.round(interval) || 1)),
});

/** The weekdays a weekly rule fires on; a rule without a list fires on the due date's weekday. */
export const repeatWeekdays = (rule: TodoRepeat, dueDate: string): Weekday[] =>
  rule.unit === 'week' && rule.weekdays?.length ? rule.weekdays : [weekdayOf(dueDate)];

/** Toggles one weekday of a weekly rule, sorted; the last selected day cannot be removed. */
export const toggleRepeatWeekday = (
  rule: TodoRepeat,
  day: Weekday,
  dueDate: string,
): TodoRepeat => {
  const current = repeatWeekdays(rule, dueDate);
  const weekdays = current.includes(day)
    ? current.filter((d) => d !== day)
    : [...current, day].sort((a, b) => a - b);
  if (weekdays.length === 0) return rule;
  return { unit: 'week', interval: rule.interval, weekdays };
};

/** "Every N <unit>s" label for the interval stepper. */
export const repeatEveryLabel = (rule: TodoRepeat): string =>
  `Every ${rule.interval === 1 ? '' : `${rule.interval} `}${rule.unit}${rule.interval === 1 ? '' : 's'}`;

export const repeatSummary = (rule: TodoRepeat | undefined): string =>
  rule ? describeRepeat(rule) : 'Does not repeat';

/**
 * Moves the part of a rule that was pinned to the old due date (a single weekday, the day of
 * the month, the yearly MM-DD) to the new one, so editing the date does not leave the rule
 * pointing elsewhere. Rules that pick other days are kept as they are.
 */
export const retargetRepeat = (rule: TodoRepeat, from: string, to: string): TodoRepeat => {
  if (rule.unit === 'week' && rule.weekdays?.length === 1 && rule.weekdays[0] === weekdayOf(from)) {
    return { ...rule, weekdays: [weekdayOf(to)] };
  }
  if (rule.unit === 'month' && rule.day === Number(from.slice(8, 10))) {
    return { ...rule, day: Number(to.slice(8, 10)) };
  }
  if (rule.unit === 'year' && rule.date === from.slice(5, 10)) {
    return { ...rule, date: to.slice(5, 10) };
  }
  return rule;
};

/**
 * What to announce after completing a todo: a recurring one is not finished, it moves on, so
 * the message names its next due date. Mirrors `completeTodo`'s anchoring.
 */
export const completionNotice = (
  item: Pick<TodoItem, 'dueDate' | 'dueTime' | 'repeat'>,
  now: Date,
): string | undefined => {
  if (!item.repeat) return undefined;
  const repeat = anchorRepeat(item.repeat, item.dueDate ?? localDateString(now.getTime()));
  const next = nextDue({ ...item, repeat }, now.getTime());
  return next ? `Done. Next due ${dueSummary(next)}` : undefined;
};
