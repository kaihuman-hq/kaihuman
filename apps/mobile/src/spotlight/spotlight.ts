import { routeToUrl } from '../navigation/routes.js';

/**
 * The slice of a search document Spotlight and Siri need. Structural on purpose: any search
 * implementation whose docs carry these fields plugs in (src/search's SearchDoc does).
 */
export interface SpotlightSourceDoc {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  date?: string;
  path: string;
}

/** Todos are the reminders-like kind; notes and log entries the journal-like ones (App Schemas). */
export type SpotlightKind = 'todo' | 'note' | 'log';

/** One row of `spotlight-items.json`. KaihumanItemEntity.swift and the Spotlight indexer decode it. */
export interface SpotlightItem {
  /** The deep link that opens it; also the Spotlight unique identifier. */
  id: string;
  kind: SpotlightKind;
  title: string;
  subtitle?: string;
  /** `YYYY-MM-DD`: log entry day or todo due day. FindItemsIntent filters on it. */
  date?: string;
}

export const SPOTLIGHT_ITEMS_FILE = 'spotlight-items.json';
/** Spotlight and entity queries stay fast; nobody scrolls past this many personal hits. */
export const MAX_SPOTLIGHT_ITEMS = 500;

const TODO_PREFIX = 'todo:';

const urlOf = (doc: SpotlightSourceDoc): string | null => {
  if (doc.kind === 'todo' && doc.id.startsWith(TODO_PREFIX)) {
    return routeToUrl({ name: 'board', item: doc.id.slice(TODO_PREFIX.length) });
  }
  if (doc.kind === 'note') return routeToUrl({ name: 'file', path: doc.path });
  // Entries share their log file, so the fragment keeps each link unique; routing ignores it.
  if (doc.kind === 'log') {
    const entry = doc.id.slice(doc.id.lastIndexOf('#') + 1);
    return `${routeToUrl({ name: 'file', path: doc.path })}#${entry}`;
  }
  return null;
};

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** The calendar day of an ISO date or timestamp, as written (no time zone shift). */
export const dayOf = (date?: string): string | undefined => DAY.exec(date ?? '')?.[0];

/** Todos and notes as Spotlight items, deduped by link, capped, untitled ones dropped. */
export function spotlightItems(
  docs: readonly SpotlightSourceDoc[],
  limit = MAX_SPOTLIGHT_ITEMS,
): SpotlightItem[] {
  const seen = new Set<string>();
  const items: SpotlightItem[] = [];
  for (const doc of docs) {
    if (items.length >= limit) break;
    const title = doc.title.trim();
    const id = urlOf(doc);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const day = dayOf(doc.date);
    items.push({
      id,
      kind: doc.kind as SpotlightKind,
      title,
      ...(doc.subtitle && { subtitle: doc.subtitle }),
      ...(day && { date: day }),
    });
  }
  return items;
}

export interface SpotlightNative {
  writeSharedFile(name: string, content: string): void;
  /** iOS only: replaces the app's Core Spotlight items with these (JSON of SpotlightItem[]). */
  indexSpotlight?(json: string): void;
}

/**
 * Publishes items for Siri entities (App Group file) and Spotlight (Core Spotlight). Returns the
 * JSON it wrote so callers can skip unchanged publishes.
 */
export function publishSpotlight(
  native: SpotlightNative,
  docs: readonly SpotlightSourceDoc[],
  previous?: string,
): string {
  const json = JSON.stringify(spotlightItems(docs));
  if (json === previous) return json;
  native.writeSharedFile(SPOTLIGHT_ITEMS_FILE, json);
  native.indexSpotlight?.(json);
  return json;
}
