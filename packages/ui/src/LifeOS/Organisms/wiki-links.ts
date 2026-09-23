// `[[wikilinks]]` as the knowledge base writes them: `[[Target]]`, `[[Target|label]]` and
// `[[Target#Heading]]`. Targets are page titles or filenames, resolved against the repo tree.

export type PageMeta = { title?: string; type?: string; tags: string[] };

const WIKILINK = /\[\[([^[\]\n]+?)\]\]/g;
// Code is left alone: a `[[x]]` inside a fence or backticks is an example, not a link.
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;

export const WIKILINK_SCHEME = 'wiki:';

function unquote(value: string): string {
  return value.trim().replace(/^(["'])(.*)\1$/, '$2');
}

export function parseFrontmatter(content: string): PageMeta {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
  const meta: PageMeta = { tags: [] };
  if (!block) return meta;
  for (const line of block.split(/\r?\n/)) {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2] ?? '';
    if (key === 'title') meta.title = unquote(value);
    else if (key === 'type') meta.type = unquote(value);
    else if (key === 'tags') {
      meta.tags = value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(unquote)
        .filter(Boolean);
    }
  }
  return meta;
}

function outsideCode(content: string, fn: (text: string) => string): string {
  return content
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('');
}

function splitLink(inner: string): { target: string; label: string } {
  const [target = '', label] = inner.split('|');
  const page = (target.split('#')[0] ?? '').trim();
  return { target: page, label: (label ?? target).trim() };
}

export function wikilinkTargets(content: string): string[] {
  const targets: string[] = [];
  outsideCode(content, (text) => {
    for (const match of text.matchAll(WIKILINK)) {
      const { target } = splitLink(match[1] ?? '');
      if (target) targets.push(target);
    }
    return text;
  });
  return targets;
}

/** Rewrites wikilinks as Markdown links with a `wiki:` href the renderer can intercept. */
export function linkifyWikilinks(content: string): string {
  return outsideCode(content, (text) =>
    text.replace(WIKILINK, (whole, inner: string) => {
      const { target, label } = splitLink(inner);
      if (!target) return whole;
      return `[${label}](${WIKILINK_SCHEME}${encodeURIComponent(target)})`;
    }),
  );
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function dirname(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

/**
 * Finds the page a wikilink points at: by path, then filename, then slug, then frontmatter title.
 * When several pages match, the one next to the linking page wins.
 */
export function resolveWikilink(
  target: string,
  paths: string[],
  titles: Record<string, string | undefined> = {},
  fromPath = '',
): string | null {
  const wanted = target.trim();
  if (!wanted) return null;
  const exact = paths.find((p) => p === wanted || p === `${wanted}.md`);
  if (exact) return exact;

  const wantedSlug = slug(basename(wanted));
  const matches = paths.filter(
    (p) =>
      p.endsWith('.md') &&
      (slug(basename(p)) === wantedSlug || (titles[p] && slug(titles[p] ?? '') === wantedSlug)),
  );
  if (matches.length === 0) return null;
  const here = dirname(fromPath);
  return matches.find((p) => dirname(p) === here) ?? matches[0] ?? null;
}

/** Pages whose wikilinks resolve to `path`, sorted. */
export function findBacklinks(
  path: string,
  contents: Record<string, string>,
  paths: string[],
  titles: Record<string, string | undefined>,
): string[] {
  return Object.entries(contents)
    .filter(
      ([from, content]) =>
        from !== path &&
        wikilinkTargets(content).some((t) => resolveWikilink(t, paths, titles, from) === path),
    )
    .map(([from]) => from)
    .sort();
}
