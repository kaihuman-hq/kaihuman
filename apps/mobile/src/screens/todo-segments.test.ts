import { parseTodos } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { todosView } from '../components/widgets/todos-tile.js';
import { deleteTodoAt, todoSegments } from './todo-segments.js';

const NOW = new Date(2026, 10, 10, 12, 0, 0);
const FILE = `- [ ] late
::due:: 2026-11-08
- [ ] now
::due:: 2026-11-10
- [>] busy
- [>] busy and due
::due:: 2026-11-10
- [ ] later
::due:: 2026-11-20
- [ ] plain
- [x] finished
`;

const seg = () => todoSegments(todosView(FILE, NOW), NOW);
const texts = (rows: { text: string }[]) => rows.map((r) => r.text);

describe('todoSegments', () => {
  it('splits Today into overdue, due today and in progress', () => {
    const { today } = seg();
    expect(texts(today.overdue)).toEqual(['late']);
    expect(texts(today.due)).toEqual(['now', 'busy and due']);
    expect(texts(today.inProgress)).toEqual(['busy']);
  });

  it('counts each segment', () => {
    expect(seg().counts).toEqual({ today: 4, doing: 2, open: 6, done: 1 });
  });

  it('filters Doing, Open and Done', () => {
    const s = seg();
    expect(texts(s.doing)).toEqual(['busy', 'busy and due']);
    expect(texts(s.open)).toHaveLength(6);
    expect(texts(s.done)).toEqual(['finished']);
  });
});

describe('deleteTodoAt', () => {
  it('removes the todo at the index', () => {
    const next = parseTodos(deleteTodoAt(FILE, 0)).items.map((i) => i.text);
    expect(next).toHaveLength(6);
    expect(next).not.toContain('late');
  });

  it('ignores an unknown index', () => {
    expect(deleteTodoAt(FILE, 99)).toBe(FILE);
  });
});
