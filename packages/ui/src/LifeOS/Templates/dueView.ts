import { compareDue, type DueStatus, dueStatus, type TodoItem } from '@kaihuman/formats';

export type DueFilter = 'all' | 'overdue' | 'today' | 'has-due';
export type BoardSort = 'newest' | 'due';

export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  all: 'All due dates',
  overdue: 'Overdue',
  today: 'Due today',
  'has-due': 'Has due date',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DueBadgeView {
  label: string;
  status: DueStatus;
  className: string;
}

const BADGE_CLASS: Record<DueStatus, string> = {
  overdue: 'text-red-500 border-red-500/40',
  today: 'text-amber-400 border-amber-400/40',
  upcoming: 'text-[var(--los-muted)] border-[var(--los-border)]',
};

/** Short date such as "Nov 10" or "Nov 10 14:00"; the stored value is already validated. */
const shortDate = (item: Pick<TodoItem, 'dueDate' | 'dueTime'>): string => {
  const [, m, d] = (item.dueDate ?? '').split('-');
  const base = `${MONTHS[Number(m) - 1]} ${Number(d)}`;
  return item.dueTime ? `${base} ${item.dueTime}` : base;
};

/** Badge for an open item with a due date; done/rejected/undated items show none. */
export const dueBadge = (item: TodoItem, now = Date.now()): DueBadgeView | undefined => {
  const status = dueStatus(item, now);
  if (!status) return undefined;
  const label = status === 'overdue' ? 'Overdue' : status === 'today' ? 'Today' : shortDate(item);
  return { label, status, className: BADGE_CLASS[status] };
};

export const matchesDueFilter = (item: TodoItem, filter: DueFilter, now = Date.now()): boolean => {
  if (filter === 'all') return true;
  if (filter === 'has-due') return !!item.dueDate;
  return dueStatus(item, now) === filter;
};

/** Stable sort by due date (undated last); the input is not mutated. */
export const sortByDue = <T extends { item: TodoItem }>(items: T[]): T[] =>
  [...items].sort((a, b) => compareDue(a.item, b.item));
