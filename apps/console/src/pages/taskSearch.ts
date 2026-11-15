import type { TaskList, TaskRow } from '@kaihuman/formats';

/** Every task of every list, done or not; the page's views only ever show a slice. */
export const searchTaskRows = (lists: TaskList[], term: string): TaskRow[] => {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  return lists.flatMap((list) =>
    list.items
      .filter((item) => [item.text, ...item.tags].some((s) => s.toLowerCase().includes(needle)))
      .map((item) => ({ item, list })),
  );
};
