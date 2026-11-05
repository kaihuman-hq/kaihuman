import { describe, expect, it } from 'vitest';
import {
  type ActionLogFile,
  appendAction,
  parseActionLog,
  serializeActionLog,
} from './action-log.js';
import { type StructuralMergeResult, structuralMergers } from './merge.js';
import {
  deleteItem,
  markAsRead,
  parseReadItLater,
  type ReadItLaterItem,
  serializeReadItLater,
} from './read-later.js';
import {
  addMilestone,
  addTodo,
  parseTodos,
  serializeTodos,
  setStatus,
  type TodoData,
  updateMilestone,
  updateTodoText,
} from './todos.js';

const mergeFile = (
  suffix: string,
  base: string,
  local: string,
  remote: string,
): StructuralMergeResult | null => {
  const merge = structuralMergers[suffix];
  if (!merge) throw new Error(`no merger for ${suffix}`);
  return merge(base, local, remote);
};

describe('structuralMergers: todos', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 5, 10, minute));
  const empty: TodoData = { milestones: [], items: [], isLegacyFormat: false };
  const add = (data: TodoData, text: string, minute: number) =>
    addTodo(data, text, [], undefined, undefined, at(minute));
  const baseData = add(add(add(empty, 'a', 1), 'b', 2), 'c', 3);
  const base = serializeTodos(baseData);
  const texts = (content: string) => parseTodos(content).items.map((i) => i.text);

  const merge = (local: TodoData, remote: TodoData) =>
    mergeFile('.todos.md', base, serializeTodos(local), serializeTodos(remote));

  it('keeps items added on both sides', () => {
    const result = merge(add(baseData, 'local', 10), add(baseData, 'remote', 11));
    expect(result?.clean).toBe(true);
    if (result?.clean) expect(texts(result.content)).toEqual(['a', 'b', 'c', 'remote', 'local']);
  });

  it('places a remote addition after its remote predecessor', () => {
    const remote = { ...baseData, items: [...add(baseData, 'r', 11).items] };
    const moved = remote.items.pop();
    if (moved) remote.items.splice(1, 0, moved);
    const result = merge(add(baseData, 'l', 10), remote);
    expect(result?.clean).toBe(true);
    if (result?.clean) expect(texts(result.content)).toEqual(['a', 'r', 'b', 'c', 'l']);
  });

  it('merges a deletion on one side with a status change on the other', () => {
    const local = { ...baseData, items: baseData.items.slice(1) };
    const remote = setStatus(baseData, 1, 'done');
    const result = merge(local, remote);
    expect(result?.clean).toBe(true);
    if (result?.clean) {
      const items = parseTodos(result.content).items;
      expect(items.map((i) => [i.text, i.status])).toEqual([
        ['b', 'done'],
        ['c', 'backlog'],
      ]);
    }
  });

  it('conflicts when one side deletes an item the other modified', () => {
    const local = { ...baseData, items: baseData.items.slice(1) };
    expect(merge(local, updateTodoText(baseData, 0, 'A'))).toEqual({ clean: false });
  });

  it('conflicts when both sides modify the same item differently', () => {
    expect(merge(updateTodoText(baseData, 1, 'x'), updateTodoText(baseData, 1, 'y'))).toEqual({
      clean: false,
    });
  });

  it('merges milestones and colour as separate fields', () => {
    const withMilestone = addMilestone(baseData, { id: 'm1', name: 'Launch' });
    const mBase = serializeTodos(withMilestone);
    const local: TodoData = { ...withMilestone, color: 'sky' };
    const remote = updateMilestone(add(withMilestone, 'r', 11), 'm1', { dueDate: '2026-12-01' });
    const result = mergeFile('.todos.md', mBase, serializeTodos(local), serializeTodos(remote));
    expect(result?.clean).toBe(true);
    if (result?.clean) {
      const data = parseTodos(result.content);
      expect(data.color).toBe('sky');
      expect(data.milestones).toEqual([{ id: 'm1', name: 'Launch', dueDate: '2026-12-01' }]);
      expect(data.items.map((i) => i.text)).toEqual(['a', 'b', 'c', 'r']);
    }
  });

  it('declines (null) when a version does not round-trip, so the caller uses a line merge', () => {
    // A free-text line the parser drops: a structural merge would lose it.
    const lossyBase = `Notes for the week\n\n${base}`;
    const local = lossyBase.replace('- [ ] a', '- [x] a');
    const remote = lossyBase.replace('- [ ] c', '- [x] c');
    expect(mergeFile('.todos.md', lossyBase, local, remote)).toBeNull();
    expect(
      mergeFile('.todos.md', base, `${base}junk\n`, serializeTodos(add(baseData, 'r', 9))),
    ).toBeNull();
  });

  it('declines when a read-it-later file is not valid JSON', () => {
    expect(mergeFile('.readitlater.json', '{', '{"items": []}', '{ "items": [] }')).toBeNull();
  });
});

describe('structuralMergers: read it later', () => {
  const item = (id: string, name: string): ReadItLaterItem => ({
    id,
    url: `https://example.com/${id}`,
    status: 'new',
    name,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  });
  const baseConfig = { items: [item('1', 'one'), item('2', 'two'), item('3', 'three')] };
  const base = serializeReadItLater(baseConfig);
  const path = '.readitlater.json';

  it('keeps items added on both sides', () => {
    const local = serializeReadItLater({ items: [...baseConfig.items, item('L', 'local')] });
    const remote = serializeReadItLater({ items: [...baseConfig.items, item('R', 'remote')] });
    const result = mergeFile(path, base, local, remote);
    expect(result?.clean).toBe(true);
    if (result?.clean) {
      expect(parseReadItLater(result.content).items.map((i) => i.id)).toEqual([
        '1',
        '2',
        '3',
        'R',
        'L',
      ]);
    }
  });

  it('merges a mark-as-read on one side with a delete on the other', () => {
    const local = serializeReadItLater(markAsRead(baseConfig, '1', 99));
    const remote = serializeReadItLater(deleteItem(baseConfig, '2'));
    const result = mergeFile(path, base, local, remote);
    expect(result?.clean).toBe(true);
    if (result?.clean) {
      expect(parseReadItLater(result.content).items).toEqual([
        { ...item('1', 'one'), status: 'read', updatedAt: 99 },
        item('3', 'three'),
      ]);
    }
  });

  it('conflicts when one side deletes an item the other marked read', () => {
    const local = serializeReadItLater(markAsRead(baseConfig, '2', 99));
    const remote = serializeReadItLater(deleteItem(baseConfig, '2'));
    expect(mergeFile(path, base, local, remote)).toEqual({ clean: false });
  });
});

describe('structuralMergers: action log', () => {
  const at = (minute: number) => new Date(2026, 10, 5, 10, minute);
  const log = (data: ActionLogFile, description: string, minute: number) =>
    appendAction(data, description, [], at(minute));
  const baseData = log(
    log({ frontmatter: { title: 'Log' }, entries: [] }, 'first', 1),
    'second',
    2,
  );
  const base = serializeActionLog(baseData);

  it('keeps entries appended on both sides, in time order', () => {
    const local = serializeActionLog(log(baseData, 'local later', 9));
    const remote = serializeActionLog(log(log(baseData, 'remote early', 5), 'remote late', 12));
    const result = mergeFile('.actionlog.md', base, local, remote);
    expect(result?.clean).toBe(true);
    if (result?.clean) {
      expect(parseActionLog(result.content).entries.map((e) => e.description)).toEqual([
        'first',
        'second',
        'remote early',
        'local later',
        'remote late',
      ]);
      expect(parseActionLog(result.content).frontmatter).toEqual({ title: 'Log' });
    }
  });

  it('applies a deletion from one side', () => {
    const local = serializeActionLog({ ...baseData, entries: baseData.entries.slice(1) });
    const remote = serializeActionLog(log(baseData, 'third', 3));
    const result = mergeFile('.actionlog.md', base, local, remote);
    expect(result?.clean).toBe(true);
    if (result?.clean) {
      expect(parseActionLog(result.content).entries.map((e) => e.description)).toEqual([
        'second',
        'third',
      ]);
    }
  });
});
