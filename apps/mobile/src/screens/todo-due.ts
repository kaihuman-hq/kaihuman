import {
  dueStatus,
  localDateString,
  parseDue,
  setTodoDue,
  type TodoData,
  type TodoDue,
  type TodoItem,
} from '@kaihuman/formats';

export type DuePreset = 'today' | 'tomorrow';

export interface DueBadge {
  label: string;
  tone: 'danger' | 'warning' | 'neutral';
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

export const dueFromPreset = (preset: DuePreset, now: Date): TodoDue => ({
  date: localDateString(addDays(now, preset === 'today' ? 0 : 1).getTime()),
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

/** `setTodoDue` addressed by position, failing loudly: it silently ignores unknown ids and bad dates. */
export const setDueOnData = (data: TodoData, index: number, due: TodoDue | undefined): TodoData => {
  const item = data.items[index];
  if (!item) throw new Error('Todo not found');
  if (due && !parseDue(due.time ? `${due.date}T${due.time}` : due.date)) {
    throw new Error('Invalid due date');
  }
  return setTodoDue(data, item.id, due);
};
