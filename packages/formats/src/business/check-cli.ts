import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Change, checkBusinessRepo, formatFinding } from './check.js';
import { BUSINESS_ROOT } from './paths.js';

const ZERO_SHA = /^0+$/;

const readTree = (cwd: string): { files: Map<string, string>; symlinks: string[] } => {
  const files = new Map<string, string>();
  const symlinks: string[] = [];
  const root = join(cwd, BUSINESS_ROOT);
  let entries: string[];
  try {
    entries = readdirSync(root, { recursive: true, encoding: 'utf8' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { files, symlinks };
    throw e;
  }
  for (const rel of entries.sort()) {
    const key = `${BUSINESS_ROOT}/${rel.split('\\').join('/')}`;
    const abs = join(root, rel);
    if (lstatSync(abs).isSymbolicLink()) {
      symlinks.push(key);
      continue;
    }
    try {
      files.set(key, readFileSync(abs, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EISDIR') throw e;
    }
  }
  return { files, symlinks };
};

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * null only when the base is absent or unknown to this clone (first push, shallow checkout).
 * Any other git failure (no git, not a repository, failing diff) propagates.
 */
const changesSince = (cwd: string, base: string | undefined): Change[] | null => {
  if (!base || ZERO_SHA.test(base)) return null;
  git(cwd, ['rev-parse', '--git-dir']);
  try {
    git(cwd, ['cat-file', '-e', `${base}^{commit}`]);
  } catch {
    return null;
  }
  const out = git(cwd, [
    'diff',
    '-z',
    '--name-status',
    '--no-renames',
    base,
    'HEAD',
    '--',
    BUSINESS_ROOT,
  ]);
  const parts = out.split('\0');
  const changes: Change[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const letter = parts[i]?.[0];
    const path = parts[i + 1];
    if (!letter || path === undefined) continue;
    // Fail closed: a type change (T) or anything unexpected counts as a modification.
    changes.push({ status: letter === 'A' || letter === 'D' ? letter : 'M', path });
  }
  return changes;
};

/** Exit code: 1 if any error, else 0. */
export const runCheck = async (argv: string[], cwd: string): Promise<number> => {
  const at = argv.indexOf('--base');
  const base = at === -1 ? undefined : argv[at + 1];
  let changes: Change[] | null;
  try {
    changes = changesSince(cwd, base);
  } catch (e) {
    console.log(`::error::git failed: ${(e as Error).message.split('\n')[0]}`);
    return 1;
  }
  if (changes === null) {
    console.log(
      '::warning::No usable base commit; frozen-file rule skipped, checking the current tree only.',
    );
  }
  const tree = readTree(cwd);
  const findings = checkBusinessRepo({
    files: tree.files,
    symlinks: tree.symlinks,
    changes,
    today: new Date().toISOString().slice(0, 10),
  });
  for (const f of findings) console.log(formatFinding(f));
  const errors = findings.filter((f) => f.level === 'error').length;
  console.log(`business check: ${errors} error(s), ${findings.length - errors} warning(s)`);
  return errors > 0 ? 1 : 0;
};

/** True when this module is the entry point, also when started through a symlink. */
export const isMain = (argvPath: string | undefined, metaUrl: string): boolean => {
  if (!argvPath) return false;
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
};

if (isMain(process.argv[1], import.meta.url)) {
  process.exit(await runCheck(process.argv.slice(2), process.cwd()));
}
