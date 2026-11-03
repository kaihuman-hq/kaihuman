import type { Dirent } from 'node:fs';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import {
  BUSINESS_ROOT,
  type BusinessRepo,
  classifyBusinessPath,
  type FileChanges,
  type Issue,
  loadBusinessRepo,
  PROFILE_PATH,
} from '@kaihuman/formats/business';
import { isInside, isNotFound, KbError, type KnowledgeBase } from './repo.js';

export interface LoadedBusiness {
  repo: BusinessRepo;
  /** Text of every non-binary file, keyed by repo-relative path (`.kh/business/...`). */
  files: Map<string, string>;
  /** Every file path, including the binary ones that are not read. */
  tree: string[];
  /** Symlinks found inside the business folder; they are never followed. */
  symlinks: string[];
}

/** The only kinds an agent may write: drafts, time, expenses (no receipt), and client todos/log. */
const WRITABLE = new Set(['draft', 'time', 'expense', 'todos', 'log']);
/** Binary kinds: listed in the tree, never read as text. */
const BINARY = new Set(['artifact', 'receipt']);

/** Formats rule issues as one KbError message: `path: message; …`. */
export function refusal(issues: readonly Issue[]): KbError {
  return new KbError(
    issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; '),
  );
}

/**
 * The business data in `<repo>/.kh/business` (always there, whichever folder the knowledge base
 * uses). Reading skips symlinks; writing is limited to the draft-only kinds and stays inside
 * the real business folder.
 */
export class BusinessFiles {
  private readonly root: string;

  constructor(private readonly kb: KnowledgeBase) {
    this.root = join(kb.repoRoot, BUSINESS_ROOT);
  }

  async load(): Promise<LoadedBusiness> {
    const files = new Map<string, string>();
    const tree: string[] = [];
    const symlinks: string[] = [];
    // Walks by hand: a symlinked folder is listed, never entered (it could point anywhere or loop).
    const walk = async (rel: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(join(this.root, rel), { withFileTypes: true });
      } catch (error) {
        if (isNotFound(error) && rel === '') return;
        throw error;
      }
      for (const entry of entries.sort((x, y) =>
        x.name < y.name ? -1 : x.name > y.name ? 1 : 0,
      )) {
        const next = rel ? `${rel}/${entry.name}` : entry.name;
        const key = `${BUSINESS_ROOT}/${next}`;
        if (entry.isSymbolicLink()) symlinks.push(key);
        else if (entry.isDirectory()) await walk(next);
        else if (entry.isFile()) {
          tree.push(key);
          if (!BINARY.has(classifyBusinessPath(key).kind)) {
            files.set(key, await readFile(join(this.root, next), 'utf8'));
          }
        }
      }
    };
    await walk('');
    tree.sort();
    return { repo: loadBusinessRepo(files, tree), files, tree, symlinks };
  }

  /** Refuses unless the business profile exists, so every tool but the check says what to do. */
  requireBusiness(loaded: LoadedBusiness): void {
    if (!loaded.files.has(PROFILE_PATH)) {
      throw new KbError(
        'No business data: .kh/business/business.yaml is missing. Enable business in the kaihuman console.',
      );
    }
  }

  /** Writes text files after checking all of them; returns the sorted repo-relative paths. */
  async write(changes: FileChanges): Promise<string[]> {
    const paths = Object.keys(changes).sort();
    const bad: string[] = [];
    for (const path of paths) {
      const content = changes[path];
      if (typeof content !== 'string') {
        bad.push(`${path} (${content === null ? 'deleting' : 'binary content'} is not allowed)`);
      } else if (!WRITABLE.has(classifyBusinessPath(path).kind)) {
        bad.push(`${path} (not a draft, time, expense, todo or log file)`);
      }
    }
    if (bad.length) throw new KbError(`Refused to write: ${bad.join('; ')}`);
    const base = await this.realBase();
    for (const path of paths) {
      const full = join(this.kb.repoRoot, path);
      await this.checkTarget(base, full, path);
      await this.refuseLinks(full, path);
    }
    for (const path of paths) {
      const full = join(this.kb.repoRoot, path);
      await mkdir(dirname(full), { recursive: true });
      // O_NOFOLLOW: a link swapped in after the check still cannot redirect the write.
      const handle = await open(
        full,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
      );
      try {
        await handle.writeFile(changes[path] as string, 'utf8');
      } finally {
        await handle.close();
      }
    }
    return paths;
  }

  /** The real folder every write must stay in; the business folder itself must not escape the repo. */
  private async realBase(): Promise<string> {
    const repo = await realpath(this.kb.repoRoot);
    const real = await nearestReal(this.root);
    if (real !== repo && !isInside(repo, real)) {
      throw new KbError(`${BUSINESS_ROOT} resolves outside the repository`);
    }
    return real;
  }

  /** Refuses when the business folder, a folder below it or the file itself is a symlink. */
  private async refuseLinks(full: string, path: string): Promise<void> {
    const rel = full.slice(this.root.length + 1).split(sep);
    let current = this.root;
    for (const part of ['', ...rel]) {
      current = part ? join(current, part) : current;
      try {
        if ((await lstat(current)).isSymbolicLink()) {
          throw new KbError(`${path} is behind a symlink; refusing to write through links`);
        }
      } catch (error) {
        if (isNotFound(error)) return;
        throw error;
      }
    }
  }

  private async checkTarget(base: string, full: string, path: string): Promise<void> {
    const outside = () => new KbError(`${path} resolves outside ${BUSINESS_ROOT}`);
    const dir = await nearestReal(dirname(full));
    if (dir !== base && !isInside(base, dir)) throw outside();
    try {
      // An existing file may itself be a link out of the folder.
      const real = await realpath(full);
      if (!isInside(base, real)) throw outside();
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

/** The real path of the deepest existing ancestor (or the path itself), plus nothing for missing parts. */
async function nearestReal(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      return await realpath(current);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}
