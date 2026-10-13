import { defineConfig } from 'vite';

// `@kaihuman/formats` ships TypeScript source, so plain tsc output could not import it at run
// time. An SSR build bundles the linked workspace package into dist/ and keeps the npm
// dependencies (@modelcontextprotocol/sdk, zod) and node: builtins as external imports.
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    target: 'node22',
    sourcemap: true,
  },
});
