import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUSINESS_ROOT } from './paths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/business/repo');

/** Every file of the fixture repo as text, keyed by its repo-relative path (`.kh/business/...`). Test support only. */
export const loadFixtureRepo = (): Map<string, string> => {
  const files = new Map<string, string>();
  for (const rel of readdirSync(root, { recursive: true, encoding: 'utf8' }).sort()) {
    const abs = join(root, rel);
    try {
      files.set(`${BUSINESS_ROOT}/${rel.split('\\').join('/')}`, readFileSync(abs, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EISDIR') throw e;
    }
  }
  return files;
};
