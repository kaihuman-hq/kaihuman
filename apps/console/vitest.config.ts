import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // Spike tests run only under vitest.spike.config.ts (they need Preact-compat
    // and signals-react bridge aliases that don't belong in the default suite).
    exclude: ['**/node_modules/**', 'src/spikes/**'],
  },
});
