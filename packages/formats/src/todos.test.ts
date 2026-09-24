import { describe, expect, it } from 'vitest';
import { parseTodos } from './todos.js';

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
