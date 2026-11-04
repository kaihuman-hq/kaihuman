import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BoardTodo } from '../background/todo-board';
import { TodoBoard, todoActions } from './TodoBoard';

const todo = (over: Partial<BoardTodo> = {}): BoardTodo => ({
  id: 'item-0',
  path: '.kh/work.todos.md',
  stream: 'work',
  text: 'Ship it',
  status: 'backlog',
  ...over,
});

let host: HTMLElement;
let sent: Record<string, any>[];
let list: BoardTodo[];

// Preact runs effects after a frame, so wait on the DOM rather than a fixed tick.
const flush = async () => {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 10));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  sent = [];
  list = [
    todo({ priority: 'super-high', color: 'sky' }),
    todo({ id: 'item-1', text: 'Active', status: 'in-progress' }),
  ];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (message: Record<string, any>, respond: (r: unknown) => void) => {
        sent.push(message);
        respond({ success: true, todos: list });
      },
    },
  };
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('todoActions', () => {
  it('offers start only for open todos and back to open only for in-progress ones', () => {
    expect(todoActions({ status: 'backlog' }).map((a) => a.title)).toEqual([
      'Start',
      'Done',
      'Reject',
    ]);
    expect(todoActions({ status: 'in-progress' }).map((a) => a.title)).toEqual([
      'Back to open',
      'Done',
      'Reject',
    ]);
  });
});

describe('TodoBoard', () => {
  it('shows stream, priority chips, status and file colour', async () => {
    render(<TodoBoard />, host);
    await flush();
    const rows = host.querySelectorAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('work');
    expect(rows[0]?.querySelector('[data-priority]')?.textContent).toBe('!!');
    expect(rows[0]?.getAttribute('style')).toContain('border-left-color');
    expect(rows[0]?.textContent).toContain('Open');
    expect(rows[1]?.textContent).toContain('In progress');
  });

  it('sends the action for the clicked todo', async () => {
    render(<TodoBoard />, host);
    await flush();
    const first = host.querySelector('li') as HTMLElement;
    (first.querySelector('[aria-label="Start"]') as HTMLButtonElement).click();
    await flush();
    expect(sent.at(-1)).toMatchObject({
      type: 'UPDATE_TODO',
      path: '.kh/work.todos.md',
      id: 'item-0',
      text: 'Ship it',
      todoAction: { type: 'status', status: 'in-progress' },
    });
    (first.querySelector('[aria-label="Change priority"]') as HTMLButtonElement).click();
    await flush();
    expect(sent.at(-1)?.todoAction).toEqual({ type: 'cycle-priority' });
  });
});
