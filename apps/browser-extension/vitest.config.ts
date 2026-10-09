import { defineConfig } from 'vitest/config';

export default defineConfig({
  // CRXJS turns `?script` imports into the bundled loader's path; tests get a fixed stand-in.
  plugins: [
    {
      name: 'crx-script-stub',
      enforce: 'pre',
      resolveId: (id) => (id.endsWith('?script') ? `\0crx-script:${id}` : undefined),
      load: (id) =>
        id.startsWith('\0crx-script:') ? "export default 'assets/index.ts-loader.js';" : undefined,
    },
  ],
  // vitest resolves its own esbuild options rather than tsconfig.app.json, so JSX in component
  // tests needs the preact runtime spelled out here.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
