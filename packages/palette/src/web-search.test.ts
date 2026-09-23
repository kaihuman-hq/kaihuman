import { describe, expect, it } from 'vitest';
import { SEARCH_ENGINES } from './web-search.js';

const urlFor = (id: string, query: string) =>
  SEARCH_ENGINES.find((engine) => engine.id === id)?.url(query);

describe('SEARCH_ENGINES', () => {
  it('builds each results page with the query as its search parameter', () => {
    expect(urlFor('google', 'rust book')).toBe('https://www.google.com/search?q=rust+book');
    expect(urlFor('duckduckgo', 'rust book')).toBe('https://duckduckgo.com/?q=rust+book');
    expect(urlFor('ecosia', 'rust book')).toBe('https://www.ecosia.org/search?q=rust+book');
    expect(urlFor('amazon', 'rust book')).toBe('https://www.amazon.com/s?k=rust+book');
    expect(urlFor('reddit', 'rust book')).toBe('https://www.reddit.com/search/?q=rust+book');
  });

  it('encodes characters that would otherwise change the url', () => {
    const url = new URL(urlFor('google', 'a&b=c #d?') ?? '');
    expect(url.searchParams.get('q')).toBe('a&b=c #d?');
    expect(url.hash).toBe('');
  });

  it('keeps ids unique, since recents are stored under them', () => {
    const ids = SEARCH_ENGINES.map((engine) => engine.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
