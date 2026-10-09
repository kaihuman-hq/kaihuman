// Zips the built extension for the Chrome Web Store: `pnpm run package` builds first.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCLUDED_FROM_PACKAGE, releaseProblems } from './release-checks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

const problems = releaseProblems(manifest, version);
if (problems.length > 0) {
  console.error(`Not packaging kaihuman ${version}:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  process.exit(1);
}

const outDir = join(root, 'release');
const zip = join(outDir, `kaihuman-extension-${version}.zip`);
mkdirSync(outDir, { recursive: true });
rmSync(zip, { force: true });
// manifest.json must sit at the zip's root, so zip from inside dist/. -X drops file attributes
// that differ between machines.
execFileSync('zip', ['-q', '-r', '-X', zip, '.', '-x', ...EXCLUDED_FROM_PACKAGE], {
  cwd: dist,
  stdio: 'inherit',
});
console.log(`Packaged ${zip}`);
