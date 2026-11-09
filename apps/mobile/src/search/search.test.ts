import { describe, expect, it } from 'vitest';
import type { SearchDoc, SearchKind } from './documents.js';
import { highlight, parseRecentSearches, searchDocs, withRecentSearch } from './search.js';

let n = 0;
const doc = (kind: SearchKind, title: string, extra: Partial<SearchDoc> = {}): SearchDoc => ({
  id: `d${n++}`,
  kind,
  title,
  path: `p/${title}`,
  target: { type: 'route', href: '/x' },
  ...extra,
});

const titles = (docs: SearchDoc[], q: string, kind: SearchKind) =>
  searchDocs(docs, q, { perKind: 50 })
    .find((g) => g.kind === kind)
    ?.results.map((r) => r.title.map((s) => s.text).join(''));

describe('searchDocs', () => {
  it('returns nothing for an empty or blank query', () => {
    const docs = [doc('todo', 'a')];
    expect(searchDocs(docs, '')).toEqual([]);
    expect(searchDocs(docs, '   ')).toEqual([]);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchDocs([doc('todo', 'a')], 'zzz')).toEqual([]);
  });

  it('ranks title prefix, then title match, then body match inside a kind', () => {
    const docs = [
      doc('note', 'zzz', { text: 'about the deploy pipeline' }),
      doc('note', 'redeploy checklist'),
      doc('note', 'Deploy guide'),
    ];
    expect(titles(docs, 'deploy', 'note')).toEqual(['Deploy guide', 'redeploy checklist', 'zzz']);
  });

  it('keeps the original order among equally ranked results', () => {
    const docs = [doc('todo', 'b task'), doc('todo', 'a task')];
    expect(titles(docs, 'task', 'todo')).toEqual(['b task', 'a task']);
  });

  it('orders groups todo, idea, wiki, knowledge, note, log, bookmark, file', () => {
    const kinds: SearchKind[] = [
      'file',
      'bookmark',
      'log',
      'note',
      'knowledge',
      'wiki',
      'idea',
      'todo',
    ];
    const groups = searchDocs(
      kinds.map((k) => doc(k, 'needle')),
      'needle',
    );
    expect(groups.map((g) => g.kind)).toEqual([
      'todo',
      'idea',
      'wiki',
      'knowledge',
      'note',
      'log',
      'bookmark',
      'file',
    ]);
    expect(groups[0]?.label).toBe('Todos');
  });

  it('limits results per kind but reports the total', () => {
    const docs = Array.from({ length: 12 }, (_, i) => doc('todo', `item ${i}`));
    const [group] = searchDocs(docs, 'item', { perKind: 5 });
    expect(group?.results).toHaveLength(5);
    expect(group?.total).toBe(12);
    expect(searchDocs(docs, 'item')[0]?.results).toHaveLength(5);
  });

  it('requires every word of a multi-word query, in any order', () => {
    const docs = [
      doc('todo', 'write the report'),
      doc('todo', 'report'),
      doc('todo', 'x', { text: 'the report to write' }),
    ];
    expect(titles(docs, 'report write', 'todo')).toEqual(['write the report', 'x']);
  });

  it('matches tags and keywords, and a subtitle', () => {
    const docs = [
      doc('todo', 'x', { keywords: 'ops' }),
      doc('bookmark', 'y', { subtitle: 'https://a.dev' }),
    ];
    expect(searchDocs(docs, 'ops')[0]?.results[0]?.doc.title).toBe('x');
    expect(searchDocs(docs, 'a.dev')[0]?.kind).toBe('bookmark');
  });

  it('highlights the title segments case-insensitively', () => {
    const [group] = searchDocs([doc('todo', 'Fix the Build')], 'build fix');
    expect(group?.results[0]?.title).toEqual([
      { text: 'Fix', match: true },
      { text: ' the ', match: false },
      { text: 'Build', match: true },
    ]);
    expect(group?.results[0]?.snippet).toBeUndefined();
  });

  it('adds a highlighted snippet around a body match', () => {
    const text = `${'lorem ipsum '.repeat(10)}the Needle is here ${'dolor sit '.repeat(10)}`;
    const [group] = searchDocs([doc('note', 'Untitled', { text })], 'needle');
    const snippet = group?.results[0]?.snippet ?? [];
    const flat = snippet.map((s) => s.text).join('');
    expect(flat.startsWith('…')).toBe(true);
    expect(flat.endsWith('…')).toBe(true);
    expect(flat.length).toBeLessThan(70);
    expect(snippet.filter((s) => s.match).map((s) => s.text)).toEqual(['Needle']);
  });

  it('has no leading ellipsis when the match is near the start, and flattens newlines', () => {
    const [group] = searchDocs([doc('note', 'T', { text: 'a\nneedle\nb' })], 'needle');
    const flat = group?.results[0]?.snippet?.map((s) => s.text).join('');
    expect(flat).toBe('a needle b');
  });

  it('omits the snippet when only a tag matches', () => {
    const [group] = searchDocs([doc('todo', 'x', { keywords: 'ops', text: 'abc' })], 'ops');
    expect(group?.results[0]?.snippet).toBeUndefined();
  });

  it('is not fooled by regex characters in the query', () => {
    const [group] = searchDocs([doc('todo', 'what (now)? [x]')], '(now)?');
    expect(group?.results[0]?.title.some((s) => s.match)).toBe(true);
  });
});

describe('highlight', () => {
  it('merges overlapping and adjacent matches', () => {
    expect(highlight('abcdef', ['abc', 'bcd'])).toEqual([
      { text: 'abcd', match: true },
      { text: 'ef', match: false },
    ]);
  });

  it('returns the whole text unmatched for no words', () => {
    expect(highlight('abc', [])).toEqual([{ text: 'abc', match: false }]);
  });
});

describe('recent searches', () => {
  it('puts the newest first, trims and de-duplicates case-insensitively', () => {
    let list: string[] = [];
    for (const q of ['alpha', ' Beta ', 'ALPHA']) list = withRecentSearch(list, q);
    expect(list).toEqual(['ALPHA', 'Beta']);
  });

  it('ignores empty queries and caps the list', () => {
    expect(withRecentSearch(['a'], '   ')).toEqual(['a']);
    let list: string[] = [];
    for (let i = 0; i < 12; i++) list = withRecentSearch(list, `q${i}`);
    expect(list).toHaveLength(8);
    expect(list[0]).toBe('q11');
    expect(withRecentSearch(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a']);
  });

  it('parses stored JSON defensively', () => {
    expect(parseRecentSearches('["a","b"]')).toEqual(['a', 'b']);
    expect(parseRecentSearches('{"x":1}')).toEqual([]);
    expect(parseRecentSearches('nope')).toEqual([]);
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches('["a",3,""]')).toEqual(['a']);
  });
});
