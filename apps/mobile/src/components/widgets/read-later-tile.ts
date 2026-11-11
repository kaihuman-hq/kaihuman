import {
  deleteItem,
  parseReadItLater,
  parseReadItLaterForWrite,
  type ReadItLaterConfig,
  serializeReadItLater,
} from '@kaihuman/formats';
import type { TileResult } from './tile-controllers.js';

const isHttpUrl = (url: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

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

export const ALREADY_SAVED = 'That page is already on the list';

/** What an RSS item hands over; `source` is the feed title. */
export interface ReadLaterDraft {
  title: string;
  url: string;
  source: string;
}

/**
 * Prepends an item like the console does (name = title, deduped by url). `content` may be empty
 * for a file not created yet. The feed title has no field of its own, so it goes in `tags`.
 */
export const addReadLaterItem = (content: string, draft: ReadLaterDraft, now: Date): TileResult => {
  if (!isHttpUrl(draft.url)) return { ok: false, error: 'Enter an http(s) URL' };
  const config = parseReadItLater(content);
  if (config.items.some((i) => i.url === draft.url)) return { ok: false, error: ALREADY_SAVED };
  const source = draft.source.trim();
  const item = {
    id: `ril-${now.getTime()}`,
    url: draft.url,
    name: draft.title.trim() || new URL(draft.url).hostname,
    status: 'new' as const,
    tags: source ? [source] : [],
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  };
  return { ok: true, content: serializeReadItLater({ ...config, items: [item, ...config.items] }) };
};
