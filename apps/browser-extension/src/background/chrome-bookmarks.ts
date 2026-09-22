/**
 * Turning the browser's own bookmark tree into drafts for the repo file.
 *
 * Kept free of `chrome.*` so the flattening is testable on its own; the service worker hands it
 * whatever `chrome.bookmarks.getTree()` returned.
 */
import type { BookmarkDraft } from './bookmarks';

export interface ChromeBookmarkNode {
  title?: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

/**
 * Depth-first, in the order the browser lists them. A bookmark inside a folder the user made
 * carries that folder's name as its only tag; the browser's own top-level roots ("Bookmarks bar",
 * "Other bookmarks") are skipped, since tagging everything with those says nothing.
 */
export function flattenChromeBookmarks(nodes: ChromeBookmarkNode[]): BookmarkDraft[] {
  const drafts: BookmarkDraft[] = [];

  const walk = (node: ChromeBookmarkNode, folder: string | null, depth: number) => {
    if (node.url) {
      drafts.push({
        title: node.title?.trim() || node.url,
        url: node.url,
        tags: folder ? [folder] : [],
      });
      return;
    }
    // depth 0 is the unnamed tree root and depth 1 its built-in roots, so a folder name only
    // becomes a tag from depth 2 down.
    const name = node.title?.trim();
    const nextFolder = depth >= 2 && name ? name : folder;
    for (const child of node.children ?? []) walk(child, nextFolder, depth + 1);
  };

  for (const node of nodes) walk(node, null, 0);
  return drafts;
}
