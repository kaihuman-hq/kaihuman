/**
 * The side panel's flat list of open todos across every `.todos.md` file. Pure: the worker feeds it
 * the synced files and writes back what `applyTodoAction` returns.
 */
import {
  cyclePriority,
  PRIORITY_RANK,
  parseTodos,
  serializeTodos,
  setStatus,
  setTodoPriority,
  type TodoColor,
  type TodoItem,
  type TodoStatus,
} from '@kaihuman/formats';
import { fileLabel } from './today';

export interface BoardTodo {
  /** Positional (`item-N`): only valid against the file version it was read from. */
  id: string;
  path: string;
  /** File name without `.todos.md`. */
  stream: string;
  color?: TodoColor;
  text: string;
  status: Extract<TodoStatus, 'backlog' | 'in-progress'>;
  priority?: TodoItem['priority'];
  createdAt?: string;
}

export type TodoAction = { type: 'status'; status: TodoStatus } | { type: 'cycle-priority' };

const rank = (todo: Pick<BoardTodo, 'priority'>) =>
  todo.priority ? PRIORITY_RANK[todo.priority] : 0;
// Undated todos sort after dated ones, so a missing date never outranks a real one.
const time = (todo: Pick<BoardTodo, 'createdAt'>) => {
  const ms = todo.createdAt ? Date.parse(todo.createdAt) : Number.NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
};

/** Higher priority first, then oldest first (the longest-waiting), then in-progress before backlog. */
export const compareTodos = (a: BoardTodo, b: BoardTodo) =>
  rank(b) - rank(a) ||
  (time(a) === time(b) ? 0 : time(a) < time(b) ? -1 : 1) ||
  Number(b.status === 'in-progress') - Number(a.status === 'in-progress');

export function collectOpenTodos(files: { path: string; content: string }[]): BoardTodo[] {
  const todos: BoardTodo[] = [];
  for (const { path, content } of files) {
    if (!path.toLowerCase().endsWith('.todos.md')) continue;
    const data = parseTodos(content);
    for (const item of data.items) {
      if (item.status !== 'backlog' && item.status !== 'in-progress') continue;
      todos.push({
        id: item.id,
        path,
        stream: fileLabel(path),
        color: data.color,
        text: item.text,
        status: item.status,
        priority: item.priority,
        createdAt: item.createdAt,
      });
    }
  }
  return todos.sort(compareTodos);
}

/** Ids are positions, so the text must still match or the file was edited since it was listed. */
export function applyTodoAction(md: string, id: string, text: string, action: TodoAction): string {
  const data = parseTodos(md);
  const index = data.items.findIndex((item) => item.id === id);
  const item = data.items[index];
  if (!item || item.text !== text) {
    throw new Error('The todo changed since it was listed. Refresh and try again.');
  }
  return serializeTodos(
    action.type === 'status'
      ? setStatus(data, index, action.status)
      : setTodoPriority(data, id, cyclePriority(item.priority)),
  );
}
