import { filterModeItems, findMatches, type ModeItem } from '@kaihuman/palette';
import { MAX_TEXT, type SearchDoc, type SearchKind } from './documents.js';

export interface Segment {
  text: string;
  match: boolean;
}

export interface SearchResult {
  doc: SearchDoc;
  title: Segment[];
  snippet?: Segment[];
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  results: SearchResult[];
  /** Matches in this kind, before the per-kind limit. */
  total: number;
}

const GROUPS: readonly { kind: SearchKind; label: string }[] = [
  { kind: 'todo', label: 'Todos' },
  { kind: 'idea', label: 'Ideas' },
  { kind: 'wiki', label: 'Wiki' },
  { kind: 'knowledge', label: 'Knowledge' },
  { kind: 'note', label: 'Notes' },
  { kind: 'log', label: 'Logs' },
  { kind: 'bookmark', label: 'Bookmarks' },
  { kind: 'file', label: 'Files' },
];

const SNIPPET_RADIUS = 20;

/** Title prefix, other title match, body-only match. */
type Buckets = [SearchDoc[], SearchDoc[], SearchDoc[]];

const wordsOf = (query: string) => [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];

/** Marks every occurrence of any word; overlapping or touching ranges merge into one. */
export function highlight(text: string, words: readonly string[]): Segment[] {
  const ranges = words
    .flatMap((w) => findMatches(text, w))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const out: Segment[] = [];
  let at = 0;
  for (const { start, end } of merged) {
    if (start > at) out.push({ text: text.slice(at, start), match: false });
    out.push({ text: text.slice(start, end), match: true });
    at = end;
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), match: false });
  return out;
}

function snippetOf(text: string, words: readonly string[]): Segment[] | undefined {
  const first = words
    .flatMap((w) => findMatches(text, w))
    .reduce<{ start: number; end: number } | undefined>(
      (best, m) => (!best || m.start < best.start ? m : best),
      undefined,
    );
  if (!first) return undefined;
  const from = Math.max(0, first.start - SNIPPET_RADIUS);
  const to = Math.min(text.length, first.end + SNIPPET_RADIUS);
  // Newlines would break the one-line preview; they are whitespace for matching anyway.
  const window = text.slice(from, to).replace(/\s+/g, ' ');
  const segments = highlight(window, words);
  if (from > 0) segments.unshift({ text: '…', match: false });
  if (to < text.length) segments.push({ text: '…', match: false });
  return segments;
}

// `filterModeItems` is the one matcher; its input is built once per doc and reused by every query.
const items = new WeakMap<SearchDoc, ModeItem>();
const docOf = new WeakMap<ModeItem, SearchDoc>();
const itemOf = (doc: SearchDoc): ModeItem => {
  let item = items.get(doc);
  if (!item) {
    item = {
      id: doc.id,
      title: doc.title,
      subtitle: doc.subtitle,
      keywords: [doc.keywords, doc.text?.slice(0, MAX_TEXT)].filter(Boolean).join(' '),
    };
    items.set(doc, item);
    docOf.set(item, doc);
  }
  return item;
};

/** Builds the matcher input ahead of the first query, so typing never pays for a cold cache. */
export const prepareDocs = (docs: readonly SearchDoc[]): void => {
  for (const doc of docs) itemOf(doc);
};

/**
 * Matches `docs` with the command palette's matcher and groups them by kind. Within a kind a title
 * that starts with the query comes first, then other title matches, then body-only matches.
 */
export function searchDocs(
  docs: readonly SearchDoc[],
  query: string,
  { perKind = 5 }: { perKind?: number } = {},
): SearchGroup[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const matched = filterModeItems(docs.map(itemOf), query);

  const ranked = new Map<SearchKind, Buckets>();
  for (const item of matched) {
    const doc = docOf.get(item);
    if (!doc) continue;
    const title = doc.title.toLowerCase();
    const rank = !words.every((w) => title.includes(w))
      ? 2
      : title.startsWith(words[0] ?? '')
        ? 0
        : 1;
    const buckets = ranked.get(doc.kind) ?? ([[], [], []] as Buckets);
    ranked.set(doc.kind, buckets);
    buckets[rank].push(doc);
  }

  const groups: SearchGroup[] = [];
  for (const { kind, label } of GROUPS) {
    const buckets = ranked.get(kind);
    if (!buckets) continue;
    const all = buckets.flat();
    groups.push({
      kind,
      label,
      total: all.length,
      results: all.slice(0, perKind).map((doc) => {
        const inTitle = words.every((w) => doc.title.toLowerCase().includes(w));
        const snippet = !inTitle && doc.text ? snippetOf(doc.text, words) : undefined;
        return { doc, title: highlight(doc.title, words), ...(snippet && { snippet }) };
      }),
    });
  }
  return groups;
}

export const RECENT_LIMIT = 8;

/** Newest first, one entry per query regardless of case. */
export function withRecentSearch(list: readonly string[], query: string, limit = RECENT_LIMIT) {
  const q = query.trim();
  if (!q) return [...list];
  const rest = list.filter((x) => x.toLowerCase() !== q.toLowerCase());
  return [q, ...rest].slice(0, limit);
}

/** Storage is untrusted: anything but a JSON array of strings reads as no history. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && x !== '')
      : [];
  } catch {
    return [];
  }
}
