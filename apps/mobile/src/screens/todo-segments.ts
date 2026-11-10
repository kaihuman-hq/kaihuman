import { localDate, parseTodos, serializeTodos } from '@kaihuman/formats';
import type { TodoRow, TodosView } from '../components/widgets/todos-tile.js';

export type TodoSegment = 'today' | 'doing' | 'open' | 'done';

export interface TodoSegments {
  /** The Today segment, in the order its sections are shown. */
  today: { overdue: TodoRow[]; due: TodoRow[]; inProgress: TodoRow[] };
  doing: TodoRow[];
  open: TodoRow[];
  done: TodoRow[];
  counts: Record<TodoSegment, number>;
}

const isOpen = (r: TodoRow) => r.status === 'backlog' || r.status === 'in-progress';

/**
 * Splits the tile's rows into the detail screen's segments. Today = overdue + due today + in
 * progress, each row in exactly one section (overdue wins over due, due over in progress).
 * Open means every unfinished todo; rejected todos appear nowhere.
 */
export const todoSegments = (view: TodosView, now: Date): TodoSegments => {
  const today = localDate(now);
  const overdue: TodoRow[] = [];
  const due: TodoRow[] = [];
  const inProgress: TodoRow[] = [];
  for (const r of view.rows) {
    if (!isOpen(r)) continue;
    if (r.dueDate && r.dueDate < today) overdue.push(r);
    else if (r.dueDate === today) due.push(r);
    else if (r.status === 'in-progress') inProgress.push(r);
  }
  const doing = view.rows.filter((r) => r.status === 'in-progress');
  const open = view.rows.filter(isOpen);
  const done = view.rows.filter((r) => r.status === 'done');
  return {
    today: { overdue, due, inProgress },
    doing,
    open,
    done,
    counts: {
      today: overdue.length + due.length + inProgress.length,
      doing: doing.length,
      open: open.length,
      done: done.length,
    },
  };
};

/** Removes the todo at `index`; unchanged content for an unknown index. */
export const deleteTodoAt = (content: string, index: number): string => {
  const data = parseTodos(content);
  if (!data.items[index]) return content;
  return serializeTodos({ ...data, items: data.items.filter((_, i) => i !== index) });
};
