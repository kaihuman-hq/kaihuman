/**
 * Logic for the Bookmarks Widget (.bookmarks.json)
 *
 * The browser extension reads the same format from `.kh/browser.bookmarks.json`, so the
 * shape here is the contract between the two apps — see apps/browser-extension/src/background/bookmarks.ts.
 */

import { Logger } from '@lifosy/core';

const logger = new Logger('BookmarksLogic');

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

const emptyConfig = (): BookmarksConfig => ({ bookmarks: [], updatedAt: '' });

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asTags = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];

/**
 * Bookmarks are opened as links by the console and the extension, so only http(s) is
 * accepted — a `javascript:` entry must never become a clickable bookmark.
 */
export const isBookmarkUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/** Canonical form of a URL, used to compare bookmarks so the same page is not stored twice. */
export const normalizeBookmarkUrl = (url: string): string => {
  try {
    return new URL(url).href;
  } catch {
    return url.trim();
  }
};

/** Hand-edited and remote files reach this, so entries without a usable url are dropped. */
export const parseBookmarks = (content: string): BookmarksConfig => {
  if (!content || !content.trim()) return emptyConfig();
  try {
    const parsed = JSON.parse(content) as { bookmarks?: unknown; updatedAt?: unknown };
    const raw = Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [];
    const bookmarks = raw
      .map((entry) => entry as Partial<Bookmark>)
      .filter((entry) => isBookmarkUrl(asString(entry?.url)))
      .map((entry, index) => ({
        id: asString(entry.id) || `bookmark-${index}`,
        title: asString(entry.title) || asString(entry.url),
        url: asString(entry.url),
        tags: asTags(entry.tags),
        createdAt: asString(entry.createdAt),
        updatedAt: asString(entry.updatedAt),
      }));
    return { bookmarks, updatedAt: asString(parsed?.updatedAt) };
  } catch (e) {
    logger.warn('Failed to parse bookmarks file', e);
    return emptyConfig();
  }
};

export const serializeBookmarks = (config: BookmarksConfig): string =>
  `${JSON.stringify(config, null, 2)}\n`;

export interface BookmarkDraft {
  title: string;
  url: string;
  tags: string[];
}

/** Rejects unusable urls and pages already bookmarked so bad data never reaches the file. */
export const addBookmark = (
  config: BookmarksConfig,
  draft: BookmarkDraft,
  now = new Date().toISOString(),
): BookmarksConfig => {
  const url = normalizeBookmarkUrl(draft.url);
  if (!isBookmarkUrl(url)) throw new Error('Enter an http(s) URL');
  if (config.bookmarks.some((b) => normalizeBookmarkUrl(b.url) === url)) {
    throw new Error('That page is already bookmarked');
  }
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    title: draft.title.trim() || url,
    url,
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    createdAt: now,
    updatedAt: now,
  };
  return { bookmarks: [bookmark, ...config.bookmarks], updatedAt: now };
};

export const deleteBookmark = (
  config: BookmarksConfig,
  id: string,
  now = new Date().toISOString(),
): BookmarksConfig => ({
  bookmarks: config.bookmarks.filter((bookmark) => bookmark.id !== id),
  updatedAt: now,
});

export const collectTags = (bookmarks: Bookmark[]): string[] =>
  Array.from(new Set(bookmarks.flatMap((bookmark) => bookmark.tags))).sort();

/** Case-insensitive match across title, url and tags; an empty query keeps everything. */
export const filterBookmarks = (bookmarks: Bookmark[], query: string, tag?: string): Bookmark[] => {
  const needle = query.trim().toLowerCase();
  return bookmarks.filter((bookmark) => {
    if (tag && !bookmark.tags.includes(tag)) return false;
    if (!needle) return true;
    return (
      bookmark.title.toLowerCase().includes(needle) ||
      bookmark.url.toLowerCase().includes(needle) ||
      bookmark.tags.some((t) => t.toLowerCase().includes(needle))
    );
  });
};
