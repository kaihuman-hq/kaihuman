import type { TodoData, TodoItem, TodoStatus } from './todos.js';
import { compareDue, dueStatus, maxPriorityRank } from './todos.js';

// Pure board filtering and ordering shared by the console kanban and the mobile board.

export type DueFilter = 'all' | 'overdue' | 'today' | 'has-due';
export type BoardSort = 'newest' | 'due';

export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  all: 'All due dates',
  overdue: 'Overdue',
  today: 'Due today',
  'has-due': 'Has due date',
};

export const matchesDueFilter = (item: TodoItem, filter: DueFilter, now = Date.now()): boolean => {
  if (filter === 'all') return true;
  if (filter === 'has-due') return !!item.dueDate;
  return dueStatus(item, now) === filter;
};

/** Stable sort by due date (undated last); the input is not mutated. */
export const sortByDue = <T extends { item: TodoItem }>(items: T[]): T[] =>
  [...items].sort((a, b) => compareDue(a.item, b.item));

/** Newest first by creation time (undated last); the input is not mutated. */
export const sortByNewest = <T extends { item: TodoItem }>(items: T[]): T[] =>
  [...items].sort((a, b) => (b.item.createdAt ?? '').localeCompare(a.item.createdAt ?? ''));

/** Text, tag or milestone id contains the query; an empty query matches everything. */
export const matchesBoardSearch = (item: TodoItem, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    item.text.toLowerCase().includes(q) ||
    item.tags.some((t) => t.toLowerCase().includes(q)) ||
    !!item.milestoneId?.toLowerCase().includes(q)
  );
};

export type StreamMode = 'active' | 'closed';
export type StreamSort = 'count' | 'newest';

export interface StreamFile {
  path: string;
  data: TodoData;
}

const ACTIVE: ReadonlySet<TodoStatus> = new Set(['backlog', 'in-progress']);

/** Items shown in a stream; `index` is the position in `data.items` that edits need. */
export const streamItems = (
  data: TodoData,
  mode: StreamMode,
  query: string,
): { item: TodoItem; index: number }[] => {
  const q = query.trim().toLowerCase();
  const rows: { item: TodoItem; index: number }[] = [];
  data.items.forEach((item, index) => {
    if (ACTIVE.has(item.status) !== (mode === 'active')) return;
    if (
      q &&
      !item.text.toLowerCase().includes(q) &&
      !item.tags.some((t) => t.toLowerCase().includes(q))
    )
      return;
    rows.push({ item, index });
  });
  return rows;
};

/** Streams holding a higher visible priority always lead; `sort` orders within a rank. */
export const sortStreams = <F extends StreamFile>(
  files: readonly F[],
  sort: StreamSort,
  mode: StreamMode,
  query = '',
): F[] => {
  const keyed = files.map((f) => {
    const rows = streamItems(f.data, mode, query);
    const k =
      sort === 'count'
        ? rows.length
        : rows.reduce(
            (m, r) => (r.item.createdAt && r.item.createdAt > m ? r.item.createdAt : m),
            '',
          );
    return { f, k, rank: maxPriorityRank(rows.map((r) => r.item)) };
  });
  return keyed
    .sort(
      (a, b) =>
        b.rank - a.rank || (a.k < b.k ? 1 : a.k > b.k ? -1 : a.f.path.localeCompare(b.f.path)),
    )
    .map((x) => x.f);
};

/**
 * Lays `files` out in a previously frozen `order` (paths), so status edits never
 * reshuffle tiles under the user's cursor. Paths not in `order` follow in the given order.
 */
export const keepOrder = <F extends StreamFile>(
  files: readonly F[],
  order: readonly string[],
): F[] => {
  const pos = new Map(order.map((p, i) => [p, i]));
  const known = files.filter((f) => pos.has(f.path));
  known.sort((a, b) => (pos.get(a.path) ?? 0) - (pos.get(b.path) ?? 0));
  return [...known, ...files.filter((f) => !pos.has(f.path))];
};

const ALL_STATUSES: TodoStatus[] = ['backlog', 'in-progress', 'done', 'rejected'];
export const actionsFor = (status: TodoStatus): TodoStatus[] =>
  ALL_STATUSES.filter((s) => s !== status);

export const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/** Touched within two weeks; an item with no usable timestamp always counts as recent. */
export const isRecent = (item: TodoItem, now = Date.now()): boolean => {
  const ts = item.updatedAt ?? (item.createdAt ? new Date(item.createdAt).getTime() : null);
  return !ts || ts >= now - TWO_WEEKS_MS;
};

/** The console's per-column "2W" filter; `recentOnly` false keeps everything. */
export const filterRecent = <T extends { item: TodoItem }>(
  items: T[],
  recentOnly: boolean,
  now = Date.now(),
): T[] => (recentOnly ? items.filter((a) => isRecent(a.item, now)) : items);
