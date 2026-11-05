import { parseTodos, serializeTodos, type TodoData, type TodoItem } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { moveTodoChanges } from './moveTodo';

const file = (...texts: string[]) =>
  serializeTodos({
    milestones: [],
    isLegacyFormat: false,
    items: texts.map((text, n) => ({
      id: `item-${n}`,
      text,
      status: 'backlog',
      tags: [],
      createdAt: `2026-01-0${n + 1}T00:00:00Z`,
    })) as TodoItem[],
  } as TodoData);

describe('moveTodoChanges', () => {
  it('moves the dragged item even when newer contents shifted its index', () => {
    const dragged = { text: 'two', createdAt: '2026-01-02T00:00:00Z' };
    // Index 1 used to be "two"; a remote edit removed "one", so index 1 is now "three".
    const src = serializeTodos({
      ...parseTodos(file('two', 'three')),
      items: parseTodos(file('one', 'two', 'three')).items.slice(1),
    });
    const changes = moveTodoChanges({ 'a.md': src, 'b.md': file('z') }, 'a.md', 'b.md', dragged);
    expect(parseTodos(changes['a.md'] ?? '').items.map((i) => i.text)).toEqual(['three']);
    expect(parseTodos(changes['b.md'] ?? '').items.map((i) => i.text)).toEqual(['z', 'two']);
  });

  it('returns no changes when the item is gone', () => {
    const dragged = { text: 'gone', createdAt: undefined };
    expect(
      moveTodoChanges({ 'a.md': file('one'), 'b.md': file('z') }, 'a.md', 'b.md', dragged),
    ).toEqual({});
  });
});
