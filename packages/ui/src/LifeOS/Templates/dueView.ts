import { type DueStatus, dueStatus, type TodoItem } from '@kaihuman/formats';

// The filter and sort logic lives in @kaihuman/formats so the mobile board shares it.
export {
  type BoardSort,
  DUE_FILTER_LABELS,
  type DueFilter,
  matchesDueFilter,
  sortByDue,
} from '@kaihuman/formats';

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
