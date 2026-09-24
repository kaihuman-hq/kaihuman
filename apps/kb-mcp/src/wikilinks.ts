const WIKILINK = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;

/** Returns unique link targets from `[[Target]]`, `[[Target|alias]]` and `[[Target#heading]]`. */
export function extractWikilinks(text: string): string[] {
  const targets = new Set<string>();
  for (const match of text.matchAll(WIKILINK)) {
    const target = (match[1] ?? '').trim();
    if (target) targets.add(target);
  }
  return [...targets];
}

/** Same slug rule the console uses for raw notes, without the length cap. */
export function slugify(text: string): string {
  return text
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export interface LinkablePage {
  file: string;
  title: string;
}

/** True when a wikilink target refers to the page by title, filename or slug (case-insensitive). */
export function linkMatchesPage(target: string, page: LinkablePage): boolean {
  const normalized = target.trim().toLowerCase().replace(/\.md$/, '');
  const fileSlug = page.file.replace(/\.md$/, '').toLowerCase();
  return (
    normalized === page.title.toLowerCase() ||
    normalized === fileSlug ||
    slugify(normalized) === fileSlug
  );
}
