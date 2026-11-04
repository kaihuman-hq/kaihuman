import { describe, expect, it } from 'vitest';
import { moveTodo, parseTodos } from './todos.js';

describe('parseTodos', () => {
  it('reads milestones and todos the way the console writes them', () => {
    const md = [
      '---',
      'milestones:',
      '  - id: v1',
      '    name: Launch',
      '    dueDate: 2026-09-30',
      '---',
      '',
      '- [>] Implement demo mode #dev !v1',
      '::created:: 2026-09-01T00:00:00.000Z',
      '- [x] Done thing',
    ].join('\n');
    const { milestones, items } = parseTodos(md);
    expect(milestones).toEqual([{ id: 'v1', name: 'Launch', dueDate: '2026-09-30' }]);
    expect(items[0]).toMatchObject({
      text: 'Implement demo mode',
      status: 'in-progress',
      tags: ['dev'],
      milestoneId: 'v1',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    expect(items[1]).toMatchObject({ text: 'Done thing', status: 'done' });
  });
});

describe('moveTodo', () => {
  const data = parseTodos('- [ ] a\n- [ ] b\n- [ ] c\n');
  it('moves an item down and up', () => {
    expect(moveTodo(data, 0, 2).items.map((i) => i.text)).toEqual(['b', 'c', 'a']);
    expect(moveTodo(data, 2, 0).items.map((i) => i.text)).toEqual(['c', 'a', 'b']);
  });
  it('ignores out-of-range indexes', () => {
    expect(moveTodo(data, 0, 5)).toBe(data);
    expect(moveTodo(data, -1, 1)).toBe(data);
  });
});
