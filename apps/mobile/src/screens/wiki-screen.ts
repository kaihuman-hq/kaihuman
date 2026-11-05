import { basename, type ContentFiles, dirname, githubContentFiles } from './file-editor-screen.js';

export const WIKI_FOLDER = '.kh/wiki';

export interface WikiPage {
  path: string;
  title: string;
  tags: string[];
  content: string;
}

export type WikiSegment =
  | { type: 'text'; text: string }
  /** `path` is null when no page matches the link target. */
  | { type: 'link'; label: string; target: string; path: string | null };

const WIKILINK = /\[\[([^[\]\n]+?)\]\]/g;
// A `[[x]]` inside code is an example, not a link.
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, '$2');

export const parseWikiFrontmatter = (content: string): { title?: string; tags: string[] } => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
  const meta: { title?: string; tags: string[] } = { tags: [] };
  if (!block) return meta;
  for (const line of block.split(/\r?\n/)) {
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (m?.[1] === 'title') meta.title = unquote(m[2] ?? '');
    else if (m?.[1] === 'tags') {
      meta.tags = (m[2] ?? '')
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(unquote)
        .filter(Boolean);
    }
  }
  return meta;
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const splitLink = (inner: string) => {
  const [target = '', label] = inner.split('|');
  const page = (target.split('#')[0] ?? '').trim();
  return { target: page, label: (label ?? target).trim() };
};

export const tokenizeWikiLinks = (content: string): WikiSegment[] => {
  const out: WikiSegment[] = [];
  content.split(CODE).forEach((part, i) => {
    if (i % 2 === 1) {
      out.push({ type: 'text', text: part });
      return;
    }
    let last = 0;
    for (const m of part.matchAll(WIKILINK)) {
      const { target, label } = splitLink(m[1] ?? '');
      if (!target) continue;
      if (m.index > last) out.push({ type: 'text', text: part.slice(last, m.index) });
      out.push({ type: 'link', label, target, path: null });
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push({ type: 'text', text: part.slice(last) });
  });
  return out;
};

export interface WikiDeps {
  files?: ContentFiles;
}

export class WikiScreenController {
  private readonly files: ContentFiles;
  private pages: WikiPage[] = [];
  private tagFilter: string | null = null;

  constructor({ files }: WikiDeps = {}) {
    this.files = files ?? githubContentFiles;
  }

  async load(): Promise<void> {
    await this.files.refresh();
    const prefix = `${WIKI_FOLDER}/`;
    const paths = this.files
      .tree()
      .filter((i) => i.type !== 'tree' && i.path.startsWith(prefix) && i.path.endsWith('.md'))
      .map((i) => i.path)
      .sort();
    const pages = await Promise.all(
      paths.map(async (path): Promise<WikiPage | null> => {
        try {
          const content = await this.files.read(path);
          const meta = parseWikiFrontmatter(content);
          return {
            path,
            title: meta.title || basename(path).replace(/\.md$/, ''),
            tags: meta.tags,
            content,
          };
        } catch {
          return null;
        }
      }),
    );
    this.pages = pages.filter((p): p is WikiPage => p !== null);
  }

  allTags(): string[] {
    return [...new Set(this.pages.flatMap((p) => p.tags))].sort();
  }

  setTag(tag: string | null): void {
    this.tagFilter = tag;
  }

  /** Pages carrying the active tag, or all of them. */
  list(): WikiPage[] {
    const tag = this.tagFilter;
    return tag ? this.pages.filter((p) => p.tags.includes(tag)) : this.pages;
  }

  page(path: string): WikiPage | undefined {
    return this.pages.find((p) => p.path === path);
  }

  /** Finds the page a link points at: path, filename, slug, then title; a sibling page wins ties. */
  resolve(target: string, fromPath = ''): string | null {
    const wanted = target.trim();
    if (!wanted) return null;
    const exact = this.pages.find((p) => p.path === wanted || p.path === `${wanted}.md`);
    if (exact) return exact.path;
    const wantedSlug = slug(basename(wanted));
    const matches = this.pages.filter(
      (p) => slug(basename(p.path)) === wantedSlug || slug(p.title) === wantedSlug,
    );
    const here = dirname(fromPath);
    return (matches.find((p) => dirname(p.path) === here) ?? matches[0])?.path ?? null;
  }

  /** A page's content split into text and resolved `[[wikilink]]` segments. */
  render(path: string): WikiSegment[] {
    const page = this.page(path);
    if (!page) return [];
    return tokenizeWikiLinks(page.content).map((s) =>
      s.type === 'link' ? { ...s, path: this.resolve(s.target, path) } : s,
    );
  }

  /** Pages whose wikilinks resolve to `path`, sorted. */
  backlinks(path: string): WikiPage[] {
    return this.pages
      .filter(
        (p) =>
          p.path !== path &&
          tokenizeWikiLinks(p.content).some(
            (s) => s.type === 'link' && this.resolve(s.target, p.path) === path,
          ),
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
