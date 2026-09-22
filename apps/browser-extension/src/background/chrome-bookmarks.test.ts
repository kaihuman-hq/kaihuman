import { describe, expect, it } from 'vitest';
import { type ChromeBookmarkNode, flattenChromeBookmarks } from './chrome-bookmarks';

/** The shape chrome.bookmarks.getTree() returns: an unnamed root holding the built-in roots. */
const tree = (...roots: ChromeBookmarkNode[]): ChromeBookmarkNode[] => [
  { title: '', children: roots },
];

describe('flattenChromeBookmarks', () => {
  it('reads bookmarks out of the built-in roots without tagging them', () => {
    const drafts = flattenChromeBookmarks(
      tree(
        { title: 'Bookmarks bar', children: [{ title: 'Vitest', url: 'https://vitest.dev/' }] },
        { title: 'Other bookmarks', children: [{ title: 'Zulip', url: 'https://zulip.example/' }] },
      ),
    );

    expect(drafts).toEqual([
      { title: 'Vitest', url: 'https://vitest.dev/', tags: [] },
      { title: 'Zulip', url: 'https://zulip.example/', tags: [] },
    ]);
  });

  it('tags a bookmark with the folder the user put it in', () => {
    const drafts = flattenChromeBookmarks(
      tree({
        title: 'Bookmarks bar',
        children: [{ title: 'Dev', children: [{ title: 'Vitest', url: 'https://vitest.dev/' }] }],
      }),
    );

    expect(drafts).toEqual([{ title: 'Vitest', url: 'https://vitest.dev/', tags: ['Dev'] }]);
  });

  it('uses the nearest folder for a deeply nested bookmark', () => {
    const drafts = flattenChromeBookmarks(
      tree({
        title: 'Bookmarks bar',
        children: [
          {
            title: 'Dev',
            children: [
              { title: 'Testing', children: [{ title: 'Vitest', url: 'https://vitest.dev/' }] },
            ],
          },
        ],
      }),
    );

    expect(drafts[0]?.tags).toEqual(['Testing']);
  });

  it('keeps the browser’s own order, depth first', () => {
    const drafts = flattenChromeBookmarks(
      tree({
        title: 'Bookmarks bar',
        children: [
          { title: 'First', url: 'https://first.example/' },
          { title: 'Folder', children: [{ title: 'Inside', url: 'https://inside.example/' }] },
          { title: 'Last', url: 'https://last.example/' },
        ],
      }),
    );

    expect(drafts.map((d) => d.title)).toEqual(['First', 'Inside', 'Last']);
  });

  it('falls back to the url when a bookmark has no title', () => {
    const drafts = flattenChromeBookmarks(
      tree({
        title: 'Bookmarks bar',
        children: [{ title: '  ', url: 'https://nameless.example/' }],
      }),
    );

    expect(drafts[0]?.title).toBe('https://nameless.example/');
  });

  it('ignores empty folders and a tree with nothing in it', () => {
    expect(flattenChromeBookmarks([])).toEqual([]);
    expect(flattenChromeBookmarks(tree({ title: 'Bookmarks bar', children: [] }))).toEqual([]);
    expect(flattenChromeBookmarks(tree({ title: 'Bookmarks bar' }))).toEqual([]);
  });
});
