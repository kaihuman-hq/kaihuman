import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Change, checkBusinessRepo, formatFinding } from './check.js';
import { BUSINESS_ROOT } from './paths.js';

const ZERO_SHA = /^0+$/;

const readTree = (cwd: string): Map<string, string> => {
  const files = new Map<string, string>();
  const root = join(cwd, BUSINESS_ROOT);
  let entries: string[];
  try {
    entries = readdirSync(root, { recursive: true, encoding: 'utf8' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return files;
    throw e;
  }
  for (const rel of entries.sort()) {
    try {
      files.set(
        `${BUSINESS_ROOT}/${rel.split('\\').join('/')}`,
        readFileSync(join(root, rel), 'utf8'),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EISDIR') throw e;
    }
  }
  return files;
};

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** null when there is no base or it is not in this clone (first push, shallow checkout). */
const changesSince = (cwd: string, base: string | undefined): Change[] | null => {
  if (!base || ZERO_SHA.test(base)) return null;
  try {
    git(cwd, ['cat-file', '-e', `${base}^{commit}`]);
    const out = git(cwd, [
      'diff',
      '--name-status',
      '--no-renames',
      base,
      'HEAD',
      '--',
      BUSINESS_ROOT,
    ]);
    return out
      .split('\n')
      .filter((l) => l.trim() !== '')
      .flatMap((l) => {
        const [status, ...rest] = l.split('\t');
        return status === 'A' || status === 'M' || status === 'D'
          ? [{ status, path: rest.join('\t') }]
          : [];
      });
  } catch {
    return null;
  }
};

/** Exit code: 1 if any error, else 0. */
export const runCheck = async (argv: string[], cwd: string): Promise<number> => {
  const at = argv.indexOf('--base');
  const base = at === -1 ? undefined : argv[at + 1];
  const changes = changesSince(cwd, base);
  if (changes === null) {
    console.log(
      '::warning::No usable base commit; frozen-file rule skipped, checking the current tree only.',
    );
  }
  const findings = checkBusinessRepo({
    files: readTree(cwd),
    changes,
    today: new Date().toISOString().slice(0, 10),
  });
  for (const f of findings) console.log(formatFinding(f));
  const errors = findings.filter((f) => f.level === 'error').length;
  console.log(`business check: ${errors} error(s), ${findings.length - errors} warning(s)`);
  return errors > 0 ? 1 : 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runCheck(process.argv.slice(2), process.cwd()));
}
