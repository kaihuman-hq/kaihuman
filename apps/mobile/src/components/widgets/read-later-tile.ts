import {
  deleteItem,
  parseReadItLaterForWrite,
  type ReadItLaterConfig,
  serializeReadItLater,
} from '@kaihuman/formats';
import type { TileResult } from './tile-controllers.js';

const GONE = 'That item is no longer on the list';

/** Rejects (rather than silently no-ops) when the id is stale, like the mark-read mutator. */
const withItem = (
  content: string,
  id: string,
  change: (config: ReadItLaterConfig) => ReadItLaterConfig,
): TileResult => {
  try {
    const config = parseReadItLaterForWrite(content);
    if (!config.items.some((i) => i.id === id)) return { ok: false, error: GONE };
    return { ok: true, content: serializeReadItLater(change(config)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/** Puts a read item back in the unread queue. */
export const markReadLaterNew = (content: string, id: string, now: Date): TileResult =>
  withItem(content, id, (config) => ({
    ...config,
    items: config.items.map((i) =>
      i.id === id ? { ...i, status: 'new' as const, updatedAt: now.getTime() } : i,
    ),
  }));

export const deleteReadLaterItem = (content: string, id: string): TileResult =>
  withItem(content, id, (config) => deleteItem(config, id));
