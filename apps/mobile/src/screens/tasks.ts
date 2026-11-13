import {
  groupTaskRows,
  sortTaskRows,
  TASK_SMART_LABELS,
  type TaskBucket,
  type TaskList,
  type TaskSmartView,
  taskRows,
} from '@kaihuman/formats';

export const TASK_VIEWS: readonly TaskSmartView[] = ['today', 'week', 'inbox', 'completed'];

export const TASK_VIEW_OPTIONS = TASK_VIEWS.map((id) => ({
  value: id,
  label: TASK_SMART_LABELS[id],
}));

/** One row, addressed by file path and index for writes (valid until the next write). */
export interface TaskEntry {
  item: TaskList['items'][number];
  listName: string;
  filePath: string;
  itemIndex: number;
}

export interface TaskSection {
  bucket: TaskBucket;
  label: string;
  entries: TaskEntry[];
}

/**
 * The console's smart view (Today, Next 7 Days, Inbox, Completed) split into due buckets, each
 * sorted by due. Completed is one flat list, newest first, as the console shows it.
 */
export const taskSections = (
  lists: TaskList[],
  view: TaskSmartView,
  inboxPath: string,
  now: number,
): TaskSection[] => {
  const rows = taskRows(lists, { kind: 'smart', id: view }, inboxPath, now);
  const entry = ({ item, list }: (typeof rows)[number]): TaskEntry => ({
    item,
    listName: list.name,
    filePath: list.path,
    itemIndex: list.items.indexOf(item),
  });
  if (view === 'completed') {
    return rows.length ? [{ bucket: 'none', label: 'Completed', entries: rows.map(entry) }] : [];
  }
  return groupTaskRows(sortTaskRows(rows, 'due'), now).map((g) => ({
    bucket: g.bucket,
    label: g.label,
    entries: g.rows.map(entry),
  }));
};
