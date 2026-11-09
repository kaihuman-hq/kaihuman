import {
  type Bookmark,
  isHttpUrl,
  parseBookmarksFile,
  serializeBookmarksFile,
  type TileResult,
} from './tile-controllers.js';

const fail = (error: string): TileResult => ({ ok: false, error });

const change = (
  content: string,
  id: string,
  now: Date,
  edit: (b: Bookmark, others: Bookmark[]) => Bookmark | string,
): TileResult => {
  const file = parseBookmarksFile(content);
  const target = file.bookmarks.find((b) => b.id === id);
  if (!target) return fail('That bookmark no longer exists');
  const next = edit(
    target,
    file.bookmarks.filter((b) => b.id !== id),
  );
  if (typeof next === 'string') return fail(next);
  const iso = now.toISOString();
  return {
    ok: true,
    content: serializeBookmarksFile({
      bookmarks: file.bookmarks.map((b) => (b.id === id ? { ...next, updatedAt: iso } : b)),
      updatedAt: iso,
    }),
  };
};

export const setBookmarkPinned = (
  content: string,
  id: string,
  pinned: boolean,
  now: Date,
): TileResult => change(content, id, now, (b) => ({ ...b, pinned }));

/** Title may be blank (falls back to the address); tags replace the old set when given. */
export const editBookmarkEntry = (
  content: string,
  id: string,
  draft: { title: string; url: string; tags?: string[] },
  now: Date,
): TileResult =>
  change(content, id, now, (b, others) => {
    const raw = draft.url.trim();
    if (!isHttpUrl(raw)) return 'Enter an http(s) URL';
    const url = new URL(raw).href;
    if (others.some((o) => o.url === url)) return 'That page is already bookmarked';
    return {
      ...b,
      url,
      title: draft.title.trim() || url,
      tags: (draft.tags ?? b.tags).map((t) => t.trim()).filter(Boolean),
    };
  });

/** Counted on open so the Most used / Frecency sorts mean something on a phone too. */
export const recordBookmarkUse = (content: string, id: string, now: Date): TileResult =>
  change(content, id, now, (b) => ({
    ...b,
    useCount: b.useCount + 1,
    lastUsedAt: now.toISOString(),
  }));
