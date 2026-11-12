import { addDays, todoViewSections } from './todo-views.js';
import { compareDue, dueStatus, localDateString, type TodoColor, type TodoItem } from './todos.js';

// The Tasks board: one task view over every todo list, with smart lists, per-list and per-tag views.

export interface TaskList {
  path: string;
  name: string;
  color?: TodoColor;
  items: TodoItem[];
}

export interface TaskRow {
  item: TodoItem;
  list: TaskList;
}

export type TaskSmartView = 'today' | 'week' | 'inbox' | 'completed';

export type TaskBoardView =
  | { kind: 'smart'; id: TaskSmartView }
  | { kind: 'list'; path: string }
  | { kind: 'tag'; tag: string };

export type TaskSort = 'due' | 'list';

export const TASK_SMART_LABELS: Record<TaskSmartView, string> = {
  today: 'Today',
  week: 'Next 7 Days',
  inbox: 'Inbox',
  completed: 'Completed',
};

const TODOS_SUFFIX = '.todos.md';

export const inboxPathFor = (appFolder: string): string => `${appFolder}/inbox${TODOS_SUFFIX}`;

/** Display name of a list file: its base name without `.todos.md`; the inbox is "Inbox". */
export const taskListName = (path: string, inboxPath: string): string =>
  path === inboxPath ? 'Inbox' : (path.split('/').pop() ?? path).replace(/\.todos\.md$/, '');

const isOpen = (item: TodoItem) => item.status === 'backlog' || item.status === 'in-progress';

const flatten = (sections: { items: TodoItem[] }[]) => sections.flatMap((s) => s.items);

/** Today includes overdue items; Next 7 Days does too, as it is everything due by the 7th day. */
const datedItems = (items: TodoItem[], view: 'today' | 'week', now: number): TodoItem[] => {
  const today = flatten(todoViewSections(items, 'today', now));
  if (view === 'today') return today;
  const overdue = today.filter((it) => dueStatus(it, now) === 'overdue');
  return [...overdue, ...flatten(todoViewSections(items, 'week', now))].filter(
    (it, i, all) => all.indexOf(it) === i,
  );
};

/** Unsorted rows a view shows; every view but Completed lists open items only. */
export const taskRows = (
  lists: TaskList[],
  view: TaskBoardView,
  inboxPath: string,
  now = Date.now(),
): TaskRow[] => {
  const rows = (list: TaskList, items: TodoItem[]) => items.map((item) => ({ item, list }));
  if (view.kind === 'list') {
    return lists
      .filter((l) => l.path === view.path)
      .flatMap((l) => rows(l, l.items.filter(isOpen)));
  }
  if (view.kind === 'tag') {
    return lists.flatMap((l) =>
      rows(
        l,
        l.items.filter((it) => isOpen(it) && it.tags.includes(view.tag)),
      ),
    );
  }
  switch (view.id) {
    case 'today':
      return lists.flatMap((l) => rows(l, datedItems(l.items, 'today', now)));
    case 'week':
      return lists.flatMap((l) => rows(l, datedItems(l.items, 'week', now)));
    case 'inbox':
      return taskRows(lists, { kind: 'list', path: inboxPath }, inboxPath, now);
    case 'completed':
      return lists
        .flatMap((l) =>
          rows(
            l,
            l.items.filter((it) => it.status === 'done'),
          ),
        )
        .sort((a, b) => (b.item.updatedAt ?? 0) - (a.item.updatedAt ?? 0));
  }
};

/** By due: earliest first, undated last. By list: list name, then due. Stable otherwise. */
export const sortTaskRows = (rows: TaskRow[], sort: TaskSort): TaskRow[] =>
  [...rows].sort(
    (a, b) =>
      (sort === 'list' ? a.list.name.localeCompare(b.list.name) : 0) || compareDue(a.item, b.item),
  );

export interface TaskBoardCounts {
  smart: Record<Exclude<TaskSmartView, 'completed'>, number>;
  /** Open items per list path. */
  lists: Record<string, number>;
  /** Tags on open items with their open count, sorted by tag. */
  tags: [string, number][];
}

export const taskBoardCounts = (
  lists: TaskList[],
  inboxPath: string,
  now = Date.now(),
): TaskBoardCounts => {
  const count = (id: TaskSmartView) =>
    taskRows(lists, { kind: 'smart', id }, inboxPath, now).length;
  const tags = new Map<string, number>();
  for (const l of lists) {
    for (const it of l.items.filter(isOpen)) {
      for (const tag of it.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
  }
  return {
    smart: { today: count('today'), week: count('week'), inbox: count('inbox') },
    lists: Object.fromEntries(lists.map((l) => [l.path, l.items.filter(isOpen).length])),
    tags: [...tags].sort(([a], [b]) => a.localeCompare(b)),
  };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Row due text: "14:00" today, "Tomorrow", "Nov 14 09:30"; undefined when undated. */
export const taskDueLabel = (item: TodoItem, now = Date.now()): string | undefined => {
  if (!item.dueDate) return undefined;
  const today = localDateString(now);
  const [, m, d] = item.dueDate.split('-');
  const day =
    item.dueDate === today
      ? 'Today'
      : item.dueDate === addDays(today, 1)
        ? 'Tomorrow'
        : `${MONTHS[Number(m) - 1]} ${Number(d)}`;
  if (!item.dueTime) return day;
  return day === 'Today' ? item.dueTime : `${day} ${item.dueTime}`;
};
