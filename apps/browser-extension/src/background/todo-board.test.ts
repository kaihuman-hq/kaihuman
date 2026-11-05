import { describe, expect, it } from 'vitest';
import { applyTodoAction, collectOpenTodos } from './todo-board';

const file = (path: string, content: string) => ({ path, content });

describe('collectOpenTodos', () => {
  it('keeps backlog and in-progress todos from every .todos.md file only', () => {
    const todos = collectOpenTodos([
      file('.kh/a.todos.md', '- [ ] one\n- [x] done\n- [-] rejected\n- [>] two\n'),
      file('.kh/b.events.csv', '- [ ] not a todo file\n'),
    ]);
    expect(todos.map((t) => t.text)).toEqual(['two', 'one']);
  });

  it('carries the stream name, the file colour and the priority', () => {
    const [todo] = collectOpenTodos([
      file('.kh/deep/work.todos.md', '---\ncolor: sky\n---\n\n- [ ] ship ^high\n'),
    ]);
    expect(todo?.stream).toBe('work');
    expect(todo?.color).toBe('sky');
    expect(todo?.priority).toBe('high');
    expect(todo?.path).toBe('.kh/deep/work.todos.md');
    expect(todo?.id).toBe('item-0');
  });

  it('sorts by priority, then oldest created, then in-progress first', () => {
    const todos = collectOpenTodos([
      file(
        'a.todos.md',
        [
          '- [ ] plain old',
          '- [>] plain active',
          '- [ ] high ^high',
          '- [ ] ultra ^ultra-high',
          '- [ ] super ^super-high',
        ].join('\n'),
      ),
    ]);
    expect(todos.map((t) => t.text)).toEqual([
      'ultra',
      'super',
      'high',
      'plain active',
      'plain old',
    ]);
  });

  it('orders equal priorities by createdAt, oldest first, undated last', () => {
    const todos = collectOpenTodos([
      file(
        'a.todos.md',
        [
          '- [ ] undated',
          '- [ ] 2026-03-01T00:00:00Z newer',
          '- [ ] 2026-01-01T00:00:00Z older',
        ].join('\n'),
      ),
    ]);
    expect(todos.map((t) => t.text)).toEqual(['older', 'newer', 'undated']);
  });
});

describe('applyTodoAction', () => {
  const md = '- [ ] one\n- [ ] two\n';

  it('sets the status of the todo with that id', () => {
    const out = applyTodoAction(md, 'item-1', 'two', { type: 'status', status: 'in-progress' });
    expect(out).toContain('- [>] two');
    expect(out).toContain('- [ ] one');
  });

  it('cycles the priority', () => {
    const out = applyTodoAction(md, 'item-0', 'one', { type: 'cycle-priority' });
    expect(out).toMatch(/one \^high/);
  });

  it('refuses when the file changed under the id', () => {
    expect(() =>
      applyTodoAction(md, 'item-0', 'other', { type: 'status', status: 'done' }),
    ).toThrow(/changed/);
  });
});
