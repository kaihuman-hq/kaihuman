import { parseTodos, serializeTodos, type TodoItem } from '@kaihuman/formats';

/**
 * Builds the two-file change for moving one todo. The item is found again by text and createdAt
 * rather than by its index: ids are positional, and core may reconcile or retry the transform
 * against newer contents, where the index the UI saw now points at a different item (or none).
 * Returns no changes when the item is gone.
 */
export function moveTodoChanges(
  contents: Record<string, string>,
  sourcePath: string,
  targetPath: string,
  dragged: Pick<TodoItem, 'text' | 'createdAt'>,
): Record<string, string> {
  const sourceData = parseTodos(contents[sourcePath] ?? '');
  const index = sourceData.items.findIndex(
    (i) => i.text === dragged.text && i.createdAt === dragged.createdAt,
  );
  const item = sourceData.items[index];
  if (!item) return {};
  const targetData = parseTodos(contents[targetPath] ?? '');
  return {
    [sourcePath]: serializeTodos({
      ...sourceData,
      items: sourceData.items.filter((_, i) => i !== index),
    }),
    [targetPath]: serializeTodos({ ...targetData, items: [...targetData.items, item] }),
  };
}
