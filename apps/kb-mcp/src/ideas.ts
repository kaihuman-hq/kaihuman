import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { asIdeaSlug, type Idea, type IdeaSlug, parseIdea } from '@kaihuman/formats';
import { isInside, isNotFound, KbError, type KnowledgeBase } from './repo.js';

export interface IdeaFile {
  slug: IdeaSlug;
  /** Repo-relative, such as `.kh/ideas/palette-sync.md`. */
  path: string;
  text: string;
  idea: Idea;
}

/** Validates an idea slug; the slug pattern has no `.` or `/`, so it cannot leave the folder. */
export function requireSlug(value: string): IdeaSlug {
  const slug = asIdeaSlug(value);
  if (!slug) {
    throw new KbError(
      `"${value}" is not an idea slug: use 2–40 lowercase letters, digits and "-", starting with a letter or digit.`,
    );
  }
  return slug;
}

/** The idea files in `<kb>/ideas/<slug>.md`, one per idea. */
export class IdeaFiles {
  readonly dir: string;

  constructor(private readonly kb: KnowledgeBase) {
    this.dir = join(kb.kbDir, 'ideas');
  }

  path(slug: IdeaSlug): string {
    return `${this.kb.kbDirName}/ideas/${slug}.md`;
  }

  async list(): Promise<IdeaFile[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const slugs = names
      .filter((name) => name.endsWith('.md'))
      .map((name) => asIdeaSlug(name.slice(0, -3)))
      .filter((slug) => slug !== null)
      .sort();
    const files = await Promise.all(slugs.map((slug) => this.find(slug)));
    return files.filter((file) => file !== undefined);
  }

  async read(slug: IdeaSlug): Promise<IdeaFile> {
    const file = await this.find(slug);
    if (!file) throw new KbError(`No idea "${slug}". Use ideas_find or ideas_list to find it.`);
    return file;
  }

  /** Writes a new idea; never overwrites, so two agents cannot both create one slug. */
  async create(slug: IdeaSlug, content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.checkDir();
    try {
      await writeFile(join(this.dir, `${slug}.md`), content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new KbError(
          `Idea "${slug}" already exists. Read it with ideas_read, or pick another slug.`,
        );
      }
      throw error;
    }
  }

  /** Replaces an existing idea's text. */
  async update(slug: IdeaSlug, content: string): Promise<void> {
    const real = await this.resolve(slug);
    if (!real) throw new KbError(`No idea "${slug}". Use ideas_find or ideas_list to find it.`);
    await writeFile(real, content, 'utf8');
  }

  /** The idea, or undefined if there is no file for the slug. */
  async find(slug: IdeaSlug): Promise<IdeaFile | undefined> {
    const real = await this.resolve(slug);
    if (!real) return undefined;
    const text = await readFile(real, 'utf8');
    return { slug, path: this.path(slug), text, idea: parseIdea(text) };
  }

  /** The file's real path, or undefined if it does not exist; refuses symlinks leading out. */
  private async resolve(slug: IdeaSlug): Promise<string | undefined> {
    let real: string;
    try {
      real = await realpath(join(this.dir, `${slug}.md`));
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
    if (!isInside(await this.checkDir(), real)) {
      throw new KbError(`Idea "${slug}" resolves outside the ideas folder`);
    }
    return real;
  }

  /** The ideas folder's real path, which must stay inside the knowledge-base folder. */
  private async checkDir(): Promise<string> {
    const dir = await realpath(this.dir);
    if (!isInside(await realpath(this.kb.kbDir), dir)) {
      throw new KbError(`${this.kb.kbDirName}/ideas resolves outside ${this.kb.kbDirName}`);
    }
    return dir;
  }
}
