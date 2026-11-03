import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
    let entries: string[];
    try {
      entries = await readdir(this.root, { recursive: true, encoding: 'utf8' });
    } catch (error) {
      if (isNotFound(error)) return { repo: loadBusinessRepo(files, tree), files, tree, symlinks };
      throw error;
    }
    for (const rel of entries.sort()) {
      const key = `${BUSINESS_ROOT}/${rel.split('\\').join('/')}`;
      const info = await lstat(join(this.root, rel));
      if (info.isSymbolicLink()) {
        symlinks.push(key);
        continue;
      }
      if (!info.isFile()) continue;
      tree.push(key);
      if (BINARY.has(classifyBusinessPath(key).kind)) continue;
      files.set(key, await readFile(join(this.root, rel), 'utf8'));
    }
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
    for (const path of paths) await this.checkTarget(base, join(this.kb.repoRoot, path), path);
    for (const path of paths) {
      const full = join(this.kb.repoRoot, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, changes[path] as string, 'utf8');
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
