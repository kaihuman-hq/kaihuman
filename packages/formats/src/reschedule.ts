import type { TodoDue, TodoItem } from './todos.js';

export type RescheduleOption = 'tomorrow' | 'day-after' | 'saturday' | 'monday';

export const RESCHEDULE_OPTIONS: { id: RescheduleOption; label: string }[] = [
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'day-after', label: 'Day after tomorrow' },
  { id: 'saturday', label: 'Next Saturday' },
  { id: 'monday', label: 'Next Monday' },
];

const pad = (n: number) => String(n).padStart(2, '0');

// Calendar arithmetic through the local Date constructor, so DST shifts never move the day.
const addDays = (now: number, days: number): string => {
  const d = new Date(now);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

/** Days until the next `weekday` (0 = Sunday) strictly after today: 1..7. */
const daysUntil = (now: number, weekday: number): number =>
  ((weekday - new Date(now).getDay() + 6) % 7) + 1;

/** Date (YYYY-MM-DD, local) for a quick option, computed from the injected `now`. */
export const rescheduleDate = (option: RescheduleOption, now: number): string => {
  switch (option) {
    case 'tomorrow':
      return addDays(now, 1);
    case 'day-after':
      return addDays(now, 2);
    case 'saturday':
      return addDays(now, daysUntil(now, 6));
    case 'monday':
      return addDays(now, daysUntil(now, 1));
  }
};

/** New due for `date`, keeping the item's time-of-day when it has one. */
export const withDate = (item: Pick<TodoItem, 'dueTime'>, date: string): TodoDue =>
  item.dueTime ? { date, time: item.dueTime } : { date };

export const rescheduleDue = (
  item: Pick<TodoItem, 'dueTime'>,
  option: RescheduleOption,
  now: number,
): TodoDue => withDate(item, rescheduleDate(option, now));
