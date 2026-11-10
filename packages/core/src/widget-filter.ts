import type { WidgetFilter, WidgetTodoItem, WidgetTodoSnapshot } from './widget-sync.js';

/** File the Focus filter intent writes into the shared container; the app folds it into the snapshot. */
export const FOCUS_FILTER_FILE = 'focus-filter.json';

const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === 'string')
            .map((s) => s.trim().replace(/^#/, '')),
        ),
      ].filter(Boolean)
    : [];

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/** Parses the container file or a snapshot's `filter`; undefined = no filter (also for `{}`). */
export const parseWidgetFilter = (raw: unknown): WidgetFilter | undefined => {
  const o = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof o !== 'object' || o === null) return undefined;
  const r = o as Record<string, unknown>;
  const tags = strings(r.tags);
  const area = text(r.area);
  const board = text(r.board);
  if (tags.length === 0 && !area && !board) return undefined;
  const label = text(r.label);
  return {
    ...(tags.length > 0 && { tags }),
    ...(area && { area }),
    ...(board && { board }),
    ...(label && { label }),
  };
};

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/** Area = the todo file's name without `.todos.md` (`.kh/work.todos.md` is area `work`). */
export const areaOf = (filePath: string): string =>
  (filePath.split('/').pop() ?? '').replace(/\.todos\.md$/, '');

/** Every set dimension must match: any of the tags, the area, the board (milestone id or name). */
export const matchesWidgetFilter = (
  item: Pick<WidgetTodoItem, 'tags' | 'filePath' | 'milestoneId' | 'milestoneName'>,
  filter: WidgetFilter | undefined,
): boolean => {
  if (!filter) return true;
  const ci = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  if (filter.tags?.length && !filter.tags.some((t) => item.tags.some((x) => ci(x, t))))
    return false;
  if (filter.area && !ci(areaOf(item.filePath), filter.area)) return false;
  if (
    filter.board &&
    !ci(item.milestoneId, filter.board) &&
    !ci(item.milestoneName, filter.board)
  ) {
    return false;
  }
  return true;
};

/**
 * The snapshot as the filter sees it: `items`, `todayItems` and the today/open counts shrink.
 * Mutations still resolve ids against the full snapshot, so apply this to what is shown only.
 */
export const applyWidgetFilter = (
  snapshot: WidgetTodoSnapshot,
  filter: WidgetFilter | undefined = snapshot.filter,
): WidgetTodoSnapshot => {
  if (!filter) return snapshot;
  const keep = (i: WidgetTodoItem) => matchesWidgetFilter(i, filter);
  const items = snapshot.items.filter(keep);
  const todayItems = snapshot.todayItems.filter(keep);
  const inboxPath = `${snapshot.appFolder}/inbox.todos.md`;
  const inProgress = items.filter((i) => i.status === 'in-progress').length;
  const inbox = items.filter((i) => i.status !== 'in-progress' && i.filePath === inboxPath).length;
  return {
    ...snapshot,
    filter,
    items,
    todayItems,
    counts: { ...snapshot.counts, inProgress, inbox, backlog: items.length - inProgress - inbox },
    todayCounts: {
      ...snapshot.todayCounts,
      left: todayItems.length,
      overdue: todayItems.filter((i) => i.dueDate && i.dueDate < dayOf(snapshot)).length,
    },
  };
};

// `todayItems` carry no "today", so overdue is counted against the snapshot's own day.
const dayOf = (s: WidgetTodoSnapshot): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: s.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(s.updatedAt));
