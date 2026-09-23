export interface SearchablePage {
  file: string;
  title: string;
  type?: string;
  tags: string[];
  body: string;
}

/** Shape of `.kh/search.kb.json` as written by the `/kb-index` skill. */
export interface SearchIndex {
  version?: string;
  built?: string;
  pages?: Record<string, { title?: string; tags?: string[]; keywords?: string[] }>;
  index?: Record<string, string[]>;
}

export interface SearchResult {
  file: string;
  title: string;
  type?: string;
  tags: string[];
  score: number;
  snippet: string;
}

const WEIGHT = { title: 5, tag: 4, index: 3, keyword: 2, bodyHit: 1 } as const;
const MAX_BODY_HITS_PER_TERM = 10;
const SNIPPET_RADIUS = 80;

export function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u))].filter((t) => t.length > 0);
}

function countOccurrences(haystack: string, needle: string, max: number): number {
  let count = 0;
  let from = haystack.indexOf(needle);
  while (from !== -1 && count < max) {
    count++;
    from = haystack.indexOf(needle, from + needle.length);
  }
  return count;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Normalises index keys/values to bare filenames, since writers may include a `wiki/` prefix. */
function normalizeIndex(searchIndex: SearchIndex | undefined) {
  const terms = new Map<string, Set<string>>();
  for (const [term, files] of Object.entries(searchIndex?.index ?? {})) {
    if (Array.isArray(files)) terms.set(term.toLowerCase(), new Set(files.map(baseName)));
  }
  const keywords = new Map<string, string[]>();
  for (const [file, meta] of Object.entries(searchIndex?.pages ?? {})) {
    if (Array.isArray(meta?.keywords)) {
      keywords.set(
        baseName(file),
        meta.keywords.map((k) => k.toLowerCase()),
      );
    }
  }
  return { terms, keywords };
}

export function makeSnippet(body: string, terms: string[]): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const positions = terms.map((t) => lower.indexOf(t)).filter((i) => i !== -1);
  const hit = positions.length > 0 ? Math.min(...positions) : 0;
  const start = Math.max(0, hit - SNIPPET_RADIUS / 2);
  const end = Math.min(flat.length, start + SNIPPET_RADIUS * 2);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

/**
 * Ranks pages by weighted term hits: title and tag matches outweigh body hits, and
 * the optional prebuilt inverted index contributes its curated terms/keywords.
 */
export function searchPages(
  pages: SearchablePage[],
  query: string,
  limit: number,
  searchIndex?: SearchIndex,
): SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const { terms: indexTerms, keywords } = normalizeIndex(searchIndex);

  const results: SearchResult[] = [];
  for (const page of pages) {
    const title = page.title.toLowerCase();
    const tags = page.tags.map((t) => t.toLowerCase());
    const body = page.body.toLowerCase();
    const pageKeywords = keywords.get(page.file) ?? [];

    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += WEIGHT.title;
      if (tags.some((tag) => tag.includes(term))) score += WEIGHT.tag;
      if (indexTerms.get(term)?.has(page.file)) score += WEIGHT.index;
      if (pageKeywords.some((k) => k.includes(term))) score += WEIGHT.keyword;
      score += WEIGHT.bodyHit * countOccurrences(body, term, MAX_BODY_HITS_PER_TERM);
    }
    if (score > 0) {
      results.push({
        file: page.file,
        title: page.title,
        type: page.type,
        tags: page.tags,
        score,
        snippet: makeSnippet(page.body, terms),
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
