/**
 * Bookmarks the extension mirrors from the repo.
 *
 * The file is written by the console's Bookmarks widget (`.bookmarks.json`), so the shape here
 * is the contract between the two apps — see
 * packages/ui/src/LifeOS/Organisms/Widgets/BookmarksLogic.ts.
 */
import { isOpenableUrl, normalizeUrl } from './pinned-tabs';

/** Repo file the extension mirrors. The console can keep bookmark files anywhere; this is the
 * one the extension reads, exactly like `.kh/browser.pinnedtabs.json` for pinned tabs. */
export const BOOKMARKS_PATH = '.kh/browser.bookmarks.json';

/**
 * How long a cached copy is served without a refresh — and so, in practice, how often the
 * extension talks to GitHub on its own. Usage is counted locally between syncs.
 */
export const CACHE_TTL_MS = 60 * 60 * 1000;

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** How often this bookmark has been opened from the extension. */
  useCount: number;
  /** When it was last opened, ISO, or empty if never. */
  lastUsedAt: string;
}

export interface BookmarksConfig {
  bookmarks: Bookmark[];
  updatedAt: string;
}

/**
 * What lives in `chrome.storage.local` under `bookmarksCache`.
 *
 * This holds GitHub's state as last fetched, never a locally adjusted copy — usage counted since
 * then lives in `BookmarkUsage` and is added on read. Keeping the two apart is what makes the
 * hourly sync unable to count anything twice.
 */
export interface BookmarksCache {
  repo: string;
  bookmarks: Bookmark[];
  /** Blob sha of the cached content, which a write commits against. */
  sha: string | null;
  /** The `ETag` GitHub answered with, replayed so an unchanged file costs only a 304. */
  etag: string | null;
  fetchedAt: number;
}

/** Opens counted since the last push, per bookmark id. */
export interface UsageDelta {
  count: number;
  lastUsedAt: string;
}

/** What lives in `chrome.storage.local` under `bookmarkUsage`. */
export interface BookmarkUsage {
  repo: string;
  deltas: Record<string, UsageDelta>;
}

export const EMPTY_USAGE = (repo: string): BookmarkUsage => ({ repo, deltas: {} });

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

/**
 * The repo file is remote input and the palette turns entries into tabs, so anything without an
 * openable `http(s)` url is dropped rather than trusted.
 */
export function parseBookmarks(content: string): BookmarksConfig {
  if (!content.trim()) return { bookmarks: [], updatedAt: '' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${BOOKMARKS_PATH} is not valid JSON`);
  }
  const root = parsed as { bookmarks?: unknown; updatedAt?: unknown };
  if (!Array.isArray(root?.bookmarks)) {
    throw new Error(`${BOOKMARKS_PATH} is missing a "bookmarks" array`);
  }
  const bookmarks = root.bookmarks
    .map((entry) => entry as Partial<Bookmark>)
    .filter((entry) => isOpenableUrl(asString(entry?.url)))
    .map((entry, index) => ({
      id: asString(entry.id) || `bookmark-${index}`,
      title: asString(entry.title) || asString(entry.url),
      url: asString(entry.url),
      tags: asTags(entry.tags),
      createdAt: asString(entry.createdAt),
      updatedAt: asString(entry.updatedAt),
      useCount: asCount(entry.useCount),
      lastUsedAt: asString(entry.lastUsedAt),
    }));
  return { bookmarks, updatedAt: asString(root.updatedAt) };
}

export function serializeBookmarks(config: BookmarksConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export interface BookmarkDraft {
  title: string;
  url: string;
  tags: string[];
}

/**
 * Same rules as the console's `addBookmark`: an openable url, no duplicate page, newest first.
 * Duplicates are compared canonically, so `https://x.com` and `https://x.com/` are one page.
 */
export function addBookmark(
  config: BookmarksConfig,
  draft: BookmarkDraft,
  now = new Date().toISOString(),
): BookmarksConfig {
  const url = normalizeUrl(draft.url.trim());
  if (!isOpenableUrl(url)) throw new Error('Only http(s) pages can be bookmarked');
  if (config.bookmarks.some((bookmark) => normalizeUrl(bookmark.url) === url)) {
    throw new Error('That page is already bookmarked');
  }
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    title: draft.title.trim() || url,
    url,
    tags: draft.tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
    createdAt: now,
    updatedAt: now,
    useCount: 0,
    lastUsedAt: '',
  };
  return { bookmarks: [bookmark, ...config.bookmarks], updatedAt: now };
}

/** A cache from another repo is useless — the bookmarks live in the repo file. */
export function isCacheUsable(cache: BookmarksCache | undefined, repo: string): boolean {
  return !!cache && cache.repo === repo && Array.isArray(cache.bookmarks);
}

export function isCacheStale(cache: BookmarksCache, now = Date.now()): boolean {
  return now - cache.fetchedAt > CACHE_TTL_MS;
}

/**
 * Ranks a title prefix above a title substring, then tags, then the url, so the page you
 * half-remember the name of comes first. Matching is case-insensitive; an empty query keeps the
 * file's own order (newest first, as the console writes it).
 */
export function searchBookmarks(bookmarks: Bookmark[], query: string, limit = 20): Bookmark[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return bookmarks.slice(0, limit);

  const scored: { bookmark: Bookmark; score: number; index: number }[] = [];
  bookmarks.forEach((bookmark, index) => {
    const title = bookmark.title.toLowerCase();
    let score: number;
    if (title.startsWith(needle)) score = 0;
    else if (title.includes(needle)) score = 1;
    else if (bookmark.tags.some((tag) => tag.toLowerCase().includes(needle))) score = 2;
    else if (bookmark.url.toLowerCase().includes(needle)) score = 3;
    else return;
    scored.push({ bookmark, score, index });
  });

  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.bookmark);
}

/**
 * What the start page lists: the bookmarks opened most recently, then the rest in the file's own
 * order (newest first). The sort is stable, so a repo whose bookmarks have never been opened still
 * shows its latest ones rather than an empty grid.
 */
export function recentlyUsedBookmarks(bookmarks: Bookmark[], limit = 12): Bookmark[] {
  return [...bookmarks].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)).slice(0, limit);
}

const laterOf = (a: string, b: string) => (a > b ? a : b);

/**
 * GitHub's list with locally counted opens added on top.
 *
 * GitHub leads on everything that identifies a bookmark — which ones exist, their title, url and
 * tags — so an edit or a delete made in the console wins. Counts are the exception: they are
 * additive, so a delta is added to whatever GitHub holds rather than replacing it. Two machines
 * counting at once therefore sum instead of clobbering each other, and a delta for a bookmark
 * GitHub no longer has is dropped with it.
 */
export function applyUsage(bookmarks: Bookmark[], usage: BookmarkUsage | undefined): Bookmark[] {
  const deltas = usage?.deltas;
  if (!deltas || Object.keys(deltas).length === 0) return bookmarks;
  return bookmarks.map((bookmark) => {
    const delta = deltas[bookmark.id];
    if (!delta) return bookmark;
    return {
      ...bookmark,
      useCount: bookmark.useCount + delta.count,
      lastUsedAt: laterOf(bookmark.lastUsedAt, delta.lastUsedAt),
    };
  });
}

/** True when any delta belongs to a bookmark that still exists, i.e. there is something to push. */
export function hasUsageToPush(bookmarks: Bookmark[], usage: BookmarkUsage | undefined): boolean {
  const deltas = usage?.deltas;
  if (!deltas) return false;
  return bookmarks.some((bookmark) => (deltas[bookmark.id]?.count ?? 0) > 0);
}

/** One more open of `id`, on top of whatever has not been pushed yet. */
export function countUse(
  usage: BookmarkUsage,
  id: string,
  now = new Date().toISOString(),
): BookmarkUsage {
  const previous = usage.deltas[id];
  return {
    repo: usage.repo,
    deltas: {
      ...usage.deltas,
      [id]: { count: (previous?.count ?? 0) + 1, lastUsedAt: now },
    },
  };
}

/**
 * Removes the deltas a push has just committed, leaving anything counted while it was in flight.
 * Subtracting rather than clearing is what keeps an open during the request from being lost.
 */
export function settleUsage(usage: BookmarkUsage, pushed: BookmarkUsage): BookmarkUsage {
  const deltas: Record<string, UsageDelta> = {};
  for (const [id, delta] of Object.entries(usage.deltas)) {
    const sent = pushed.deltas[id]?.count ?? 0;
    const count = delta.count - sent;
    if (count > 0) deltas[id] = { count, lastUsedAt: delta.lastUsedAt };
  }
  return { repo: usage.repo, deltas };
}
