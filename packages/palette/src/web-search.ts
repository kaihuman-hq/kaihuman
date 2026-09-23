/**
 * Web search by URL alone: each engine is its results page with the query filled in, so searching
 * needs no API, no key and no request of our own — the browser just opens the page.
 *
 * Adding an engine is one entry in `SEARCH_ENGINES`; the palette lists them in this order.
 */
export interface SearchEngine {
  /** Stable across releases: recents are stored under it. */
  id: string;
  name: string;
  /** The results page for `query`. */
  url: (query: string) => string;
}

/** `base` plus the query as parameter `param`, encoded the way a form submit would. */
const withQuery =
  (base: string, param = 'q') =>
  (query: string) =>
    `${base}?${new URLSearchParams({ [param]: query })}`;

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  { id: 'google', name: 'Google', url: withQuery('https://www.google.com/search') },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: withQuery('https://duckduckgo.com/') },
  { id: 'ecosia', name: 'Ecosia', url: withQuery('https://www.ecosia.org/search') },
  { id: 'amazon', name: 'Amazon', url: withQuery('https://www.amazon.com/s', 'k') },
  { id: 'reddit', name: 'Reddit', url: withQuery('https://www.reddit.com/search/') },
];
