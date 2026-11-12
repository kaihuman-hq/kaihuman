import { localDate } from './dates.js';
import { compareDue, dueStatus, type TodoItem } from './todos.js';

// Date-based views over one todo list, shared by the console's todo tiles and the inbox.

export const TODO_VIEWS = ['today', 'tomorrow', 'week', 'all'] as const;
export type TodoView = (typeof TODO_VIEWS)[number];

export const TODO_VIEW_LABELS: Record<TodoView, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'Next 7 days',
  all: 'All',
};

export const isTodoView = (value: unknown): value is TodoView =>
  typeof value === 'string' && (TODO_VIEWS as readonly string[]).includes(value);

export type DueQuickPick = 'today' | 'tomorrow' | 'next-week';

export const DUE_QUICK_PICK_LABELS: Record<DueQuickPick, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  'next-week': 'Next week',
};

/** `YYYY-MM-DD` shifted by whole local days; noon avoids DST edges. */
export const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days, 12));
};

/** The local date a quick pick stands for; "next week" is the next Monday. */
export const dueQuickPick = (pick: DueQuickPick, now = Date.now()): string => {
  const today = localDate(new Date(now));
  if (pick === 'today') return today;
  if (pick === 'tomorrow') return addDays(today, 1);
  const weekday = new Date(now).getDay(); // 0 = Sunday
  return addDays(today, (8 - weekday) % 7 || 7);
};

export interface TodoViewSection {
  /** `overdue`, `today`, `all` or a `YYYY-MM-DD` for one day of the week view. */
  key: string;
  label: string;
  /** Overdue sections get a warning style. */
  overdue?: boolean;
  items: TodoItem[];
}

const isOpen = (item: TodoItem) => item.status === 'backlog' || item.status === 'in-progress';
const byDue = (items: TodoItem[]) => [...items].sort(compareDue);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayLabel = (date: string, today: string): string => {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12);
  return `${WEEKDAYS[day.getDay()]}, ${MONTHS[day.getMonth()]} ${day.getDate()}`;
};

/**
 * The items a view shows, in sections without empty ones. Dated views list open items only;
 * Today puts everything past due (earlier dates and passed times today) first, under Overdue.
 * All keeps every item in file order.
 */
export const todoViewSections = (
  items: TodoItem[],
  view: TodoView,
  now = Date.now(),
): TodoViewSection[] => {
  if (view === 'all') return items.length ? [{ key: 'all', label: 'All', items }] : [];
  const today = localDate(new Date(now));
  const open = items.filter(isOpen);
  if (view === 'today') {
    const overdue = byDue(open.filter((it) => dueStatus(it, now) === 'overdue'));
    const due = byDue(open.filter((it) => dueStatus(it, now) === 'today'));
    return [
      { key: 'overdue', label: 'Overdue', overdue: true, items: overdue },
      { key: 'today', label: 'Today', items: due },
    ].filter((s) => s.items.length > 0);
  }
  if (view === 'tomorrow') {
    const date = addDays(today, 1);
    const due = byDue(open.filter((it) => it.dueDate === date));
    return due.length ? [{ key: date, label: 'Tomorrow', items: due }] : [];
  }
  const last = addDays(today, 6);
  const sections = new Map<string, TodoItem[]>();
  for (const it of byDue(open)) {
    if (!it.dueDate || it.dueDate < today || it.dueDate > last) continue;
    sections.set(it.dueDate, [...(sections.get(it.dueDate) ?? []), it]);
  }
  return [...sections].map(([date, dayItems]) => ({
    key: date,
    label: dayLabel(date, today),
    items: dayItems,
  }));
};

/** Items per view; All counts open items, like the list header. */
export const todoViewCounts = (items: TodoItem[], now = Date.now()): Record<TodoView, number> => {
  const count = (view: TodoView) =>
    todoViewSections(items, view, now).reduce((n, s) => n + s.items.length, 0);
  return {
    today: count('today'),
    tomorrow: count('tomorrow'),
    week: count('week'),
    all: items.filter(isOpen).length,
  };
};
