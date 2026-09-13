import { defineConfig } from 'vitest/config';

export default defineConfig({
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
