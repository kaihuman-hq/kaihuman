/**
 * Bookmarks the extension mirrors from the repo.
 *
 * The file is written by the console's Bookmarks widget (`.bookmarks.json`), so the shape here
 * is the contract between the two apps — see
 * packages/ui/src/LifeOS/Organisms/Widgets/BookmarksLogic.ts.
 */
import { isOpenableUrl } from './pinned-tabs';

/** Repo file the extension mirrors. The console can keep bookmark files anywhere; this is the
 * one the extension reads, exactly like `.kh/browser.pinnedtabs.json` for pinned tabs. */
export const BOOKMARKS_PATH = '.kh/browser.bookmarks.json';

/** How long a cached copy is served without a refresh. */
export const CACHE_TTL_MS = 15 * 60 * 1000;

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookmarksConfig {
  bookmarks: Bookmark[];
  updatedAt: string;
}

/** What lives in `chrome.storage.local` under `bookmarksCache`. */
export interface BookmarksCache {
  repo: string;
  bookmarks: Bookmark[];
  /** The `ETag` GitHub answered with, replayed so an unchanged file costs only a 304. */
  etag: string | null;
  fetchedAt: number;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
    }));
  return { bookmarks, updatedAt: asString(root.updatedAt) };
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
