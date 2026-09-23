/**
 * A bookmark as the repo file holds it, and the palette's search over them.
 *
 * The file is written by the console's Bookmarks widget, so the shape is the contract between the
 * apps — see packages/ui/src/LifeOS/Organisms/Widgets/BookmarksLogic.ts.
 */
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
  /** Kept at the top of the start page, ahead of the recently used ones. */
  pinned: boolean;
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
