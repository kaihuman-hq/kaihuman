import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { getString, getStringArray, parseFrontmatter } from './frontmatter.js';
import { type LogEntry, parseLog } from './log.js';
import type { SearchIndex } from './search.js';
import { extractWikilinks, linkMatchesPage, slugify } from './wikilinks.js';

/** App folders in lookup order; `.lifeos` is the legacy name. */
export const KB_DIR_NAMES = ['.kh', '.lifeos'] as const;
export type KbDirName = (typeof KB_DIR_NAMES)[number];

export interface WikiPage {
  file: string;
  title: string;
  type?: string;
  tags: string[];
  sources: string[];
  created?: string;
  updated?: string;
  links: string[];
  body: string;
  content: string;
}

export interface PageWithBacklinks {
  page: WikiPage;
  backlinks: { file: string; title: string }[];
}

export interface NewRawNote {
  title: string;
  text: string;
  url?: string;
  tags?: string[];
}

export class KbError extends Error {
  override name = 'KbError';
}

export function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export function isInside(dir: string, path: string): boolean {
  return path.startsWith(dir + sep);
}

function toPage(file: string, content: string): WikiPage {
  const { data, body } = parseFrontmatter(content);
  return {
    file,
    title: getString(data, 'title') ?? file.replace(/\.md$/, ''),
    type: getString(data, 'type'),
    tags: getStringArray(data, 'tags'),
    sources: getStringArray(data, 'sources'),
    created: getString(data, 'created'),
    updated: getString(data, 'updated'),
    links: extractWikilinks(body),
    body,
    content,
  };
}

/** Filesystem access to one repository's knowledge base folder. */
export class KnowledgeBase {
  readonly kbDir: string;
  readonly wikiDir: string;
  readonly rawDir: string;

  private constructor(
    readonly repoRoot: string,
    readonly kbDirName: KbDirName,
  ) {
    this.kbDir = join(repoRoot, kbDirName);
    this.wikiDir = join(this.kbDir, 'wiki');
    this.rawDir = join(this.kbDir, 'raw');
  }

  /** Uses `.kh` when present, else legacy `.lifeos`, else `.kh` (created on first write). */
  static async open(repoPath: string): Promise<KnowledgeBase> {
    const repoRoot = resolve(repoPath);
    if (!(await isDirectory(repoRoot))) {
      throw new KbError(`Repository path does not exist or is not a directory: ${repoRoot}`);
    }
    for (const name of KB_DIR_NAMES) {
      if (await isDirectory(join(repoRoot, name))) return new KnowledgeBase(repoRoot, name);
    }
    return new KnowledgeBase(repoRoot, '.kh');
  }

  async listPages(): Promise<WikiPage[]> {
    let names: string[];
    try {
      names = await readdir(this.wikiDir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const files = names.filter((name) => name.endsWith('.md')).sort();
    return Promise.all(
      files.map(async (file) => toPage(file, await readFile(join(this.wikiDir, file), 'utf8'))),
    );
  }

  /** Resolves a page by filename, slug or title (case-insensitive) and collects its backlinks. */
  async readPage(ref: string): Promise<PageWithBacklinks> {
    const trimmed = ref.trim();
    if (!trimmed) throw new KbError('Page reference must not be empty');

    const direct = await this.readDirect(trimmed);
    const pages = await this.listPages();
    const page = direct ?? pages.find((p) => linkMatchesPage(trimmed, p));
    if (!page) {
      throw new KbError(
        `No wiki page matches "${trimmed}". Use kb_list or kb_search to find pages.`,
      );
    }
    const backlinks = pages
      .filter((p) => p.file !== page.file && p.links.some((link) => linkMatchesPage(link, page)))
      .map(({ file, title }) => ({ file, title }));
    return { page, backlinks };
  }

  /** Reads `<ref>.md` directly, refusing anything that resolves outside the wiki directory. */
  private async readDirect(ref: string): Promise<WikiPage | undefined> {
    const file = ref.endsWith('.md') ? ref : `${ref}.md`;
    const wikiDir = resolve(this.wikiDir);
    const full = resolve(wikiDir, file);
    if (!isInside(wikiDir, full)) {
      throw new KbError(`Page reference "${ref}" resolves outside the wiki directory`);
    }
    let real: string;
    try {
      real = await realpath(full);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
    // Symlinks could otherwise point outside the wiki directory.
    if (!isInside(await realpath(wikiDir), real)) {
      throw new KbError(`Page reference "${ref}" resolves outside the wiki directory`);
    }
    return toPage(relative(wikiDir, full), await readFile(real, 'utf8'));
  }

  async readIndex(): Promise<string> {
    return this.readKbFile('index.kb.md');
  }

  async readLog(): Promise<LogEntry[]> {
    return parseLog(await this.readKbFile('log.md'));
  }

  /** Returns the prebuilt inverted index, or undefined when absent or unreadable. */
  async readSearchIndex(): Promise<SearchIndex | undefined> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(this.kbDir, 'search.kb.json'), 'utf8'),
      );
      return parsed && typeof parsed === 'object' ? (parsed as SearchIndex) : undefined;
    } catch (error) {
      // A stale or hand-edited index must not break search; full-text scoring still works.
      if (isNotFound(error) || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  /** Writes a new unprocessed source to `raw/` and returns its repo-relative path. */
  async addRaw(note: NewRawNote): Promise<string> {
    const slug = slugify(note.title).slice(0, 40).replace(/-+$/, '') || 'note';
    const file = `${Date.now()}-${slug}.md`;
    const tags = note.tags && note.tags.length > 0 ? note.tags : ['general'];
    const content = [
      '---',
      `title: ${JSON.stringify(note.title.replace(/[\r\n]+/g, ' '))}`,
      `url: ${JSON.stringify(note.url ?? '')}`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      'processed: false',
      `tags: [${tags.join(', ')}]`,
      '---',
      '',
      note.text,
      '',
    ].join('\n');

    await mkdir(this.rawDir, { recursive: true });
    const full = join(this.rawDir, file);
    await writeFile(full, content, { encoding: 'utf8', flag: 'wx' });
    return relative(this.repoRoot, full).split(sep).join('/');
  }

  private async readKbFile(name: string): Promise<string> {
    try {
      return await readFile(join(this.kbDir, name), 'utf8');
    } catch (error) {
      if (isNotFound(error)) {
        throw new KbError(`${this.kbDirName}/${name} does not exist in ${this.repoRoot}`);
      }
      throw error;
    }
  }
}
