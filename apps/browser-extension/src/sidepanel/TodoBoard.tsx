import { PRIORITY_RANK, TODO_COLOR_HEX, type TodoStatus } from '@kaihuman/formats';
import { useEffect, useState } from 'preact/hooks';
import type { BoardTodo, TodoAction } from '../background/todo-board.js';
import { send } from '../palette/port.js';
import { errorText, Heading, iconButton } from './controls.js';

const FALLBACK_COLOR = '#5f6b7d';

const status = (status: TodoStatus): TodoAction => ({ type: 'status', status });

/** The actions a todo offers: start only from open, back to open only from in-progress. */
export const todoActions = (todo: Pick<BoardTodo, 'status'>) => {
  const actions: { label: string; title: string; action: TodoAction }[] = [];
  if (todo.status === 'backlog') {
    actions.push({ label: '▶', title: 'Start', action: status('in-progress') });
  } else {
    actions.push({ label: '↩', title: 'Back to open', action: status('backlog') });
  }
  actions.push(
    { label: '✓', title: 'Done', action: status('done') },
    { label: '✕', title: 'Reject', action: status('rejected') },
  );
  return actions;
};

/** Open and in-progress todos of every `.todos.md`, highest priority first. */
export function TodoBoard({ readOnly = false }: { readOnly?: boolean }) {
  const [todos, setTodos] = useState<BoardTodo[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = (message: object) => {
    setBusy(true);
    send(message)
      .then((response) => {
        setError(undefined);
        if (Array.isArray(response?.todos)) setTodos(response.todos);
      })
      .catch((failure) => setError(errorText(failure)))
      .finally(() => setBusy(false));
  };

  useEffect(() => run({ type: 'GET_OPEN_TODOS' }), []);

  if (!todos && !error) return null;
  const update = (todo: BoardTodo, todoAction: TodoAction) =>
    run({ type: 'UPDATE_TODO', path: todo.path, id: todo.id, text: todo.text, todoAction });

  return (
    <section class="flex flex-col gap-1" aria-label="Todos">
      <Heading title="Todos" count={todos?.length} />
      {error && <p class="border-l-2 border-nt-prod px-3 py-1 text-[12px]">{error}</p>}
      {todos?.length === 0 && <p class="text-[12px] text-nt-faint">Nothing open.</p>}
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        {todos?.map((todo) => {
          const color = todo.color ? TODO_COLOR_HEX[todo.color] : FALLBACK_COLOR;
          const rank = todo.priority ? PRIORITY_RANK[todo.priority] : 0;
          const active = todo.status === 'in-progress';
          return (
            <li
              key={`${todo.path}:${todo.id}`}
              data-status={todo.status}
              style={{ borderLeftColor: color }}
              class="flex flex-col gap-0.5 border-l-[3px] bg-nt-row-hover px-2 py-1"
            >
              <div class="flex items-start gap-1.5">
                {rank > 0 && (
                  <span
                    data-priority={rank}
                    title={todo.priority}
                    class="shrink-0 font-bold text-nt-prod"
                  >
                    {'!'.repeat(rank)}
                  </span>
                )}
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{todo.text}</span>
              </div>
              <div class="flex items-center gap-1 text-[11px]">
                <span
                  class={`border px-1 ${active ? 'border-nt-int text-nt-int' : 'border-nt-control text-nt-muted'}`}
                >
                  {active ? 'In progress' : 'Open'}
                </span>
                <span class="min-w-0 flex-1 truncate text-nt-faint" title={todo.path}>
                  <span aria-hidden="true" style={{ color }}>
                    ●{' '}
                  </span>
                  {todo.stream}
                </span>
                <button
                  type="button"
                  title="Change priority"
                  aria-label="Change priority"
                  class={iconButton}
                  disabled={busy || readOnly}
                  onClick={() => update(todo, { type: 'cycle-priority' })}
                >
                  !
                </button>
                {todoActions(todo).map(({ label, title, action }) => (
                  <button
                    key={title}
                    type="button"
                    title={title}
                    aria-label={title}
                    class={iconButton}
                    disabled={busy || readOnly}
                    onClick={() => update(todo, action)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
