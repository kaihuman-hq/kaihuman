import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const printDir = path.join(here, 'src/lib/business/print');
const stub = (file: string) => path.join(printDir, 'stubs', file);

/** Node built-ins narro imports at module level; its fs-bound paths never run in the browser. */
const STUBS: Record<string, string> = {
  fs: stub('fs.ts'),
  'fs/promises': stub('fs-promises.ts'),
  module: stub('module.ts'),
  path: stub('path.ts'),
  url: stub('url.ts'),
  'react-dom/server': path.join(printDir, 'react-dom-server.ts'),
  // The app's own `react-dom` alias turns `react-dom/server` into this before plugins run.
  'preact/compat/server': path.join(printDir, 'react-dom-server.ts'),
};

/** narro is written for React; it renders on Preact (the console's copy, not narro's React). */
const REACT: Record<string, string> = {
  react: 'preact/compat',
  'react-dom': 'preact/compat',
  'react/jsx-runtime': 'preact/jsx-runtime',
};

const NARRO = `${path.sep}@getnarro${path.sep}pdf${path.sep}`;

/** @fontsource packages are narro's own dependencies (not hoisted): found beside its real path. */
const fontsourceDir = (pkg: string): string =>
  path.resolve(
    realpathSync(path.join(here, 'node_modules/@getnarro/pdf')),
    '../../@fontsource',
    pkg,
  );

/**
 * Bundles @getnarro/pdf for the browser. The stubs apply only to imports made by narro itself,
 * so no other module (or test) ever gets a fake `fs` or `path`.
 */
export function narroBrowser(): Plugin {
  const fromConsole = path.join(here, 'index.html');
  return {
    name: 'kaihuman:narro-browser',
    enforce: 'pre',
    config: () => ({
      resolve: {
        alias: {
          '@narro-font-inter': fontsourceDir('inter'),
          '@narro-font-serif': fontsourceDir('source-serif-4'),
          '@narro-font-plex': fontsourceDir('ibm-plex-sans'),
        },
      },
    }),
    async resolveId(source, importer, options) {
      if (!importer?.includes(NARRO)) return null;
      const id = source.startsWith('node:') ? source.slice(5) : source;
      if (STUBS[id]) return STUBS[id];
      const target = REACT[id] ?? (id === 'preact' || id.startsWith('preact/') ? id : undefined);
      if (target) return this.resolve(target, fromConsole, { ...options, skipSelf: true });
      return null;
    },
  };
}
