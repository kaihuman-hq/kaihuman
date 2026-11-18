import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const s = (f: string) => path.join(here, 'stubs', f);

/** Aliases that make @getnarro/pdf bundle for the browser on Preact. Order matters (specific first). */
export const narroAliases: Record<string, string> = {
  'react-dom/server': path.join(here, 'shim-react-dom-server.ts'),
  'react/jsx-runtime': 'preact/jsx-runtime',
  'react-dom': 'preact/compat',
  react: 'preact/compat',
  'fs/promises': s('fs-promises.ts'),
  fs: s('fs.ts'),
  module: s('module.ts'),
  path: s('path.ts'),
  url: s('url.ts'),
};

/** @fontsource packages are transitive deps of narro (not hoisted): find them beside narro's real path. */
export function fontsourceDir(pkg: string): string {
  const narro = realpathSync(path.resolve(here, '../../../node_modules/@getnarro/pdf'));
  return path.resolve(narro, '../../@fontsource', pkg);
}
