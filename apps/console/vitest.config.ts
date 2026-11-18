import { defineConfig } from 'vitest/config';
import { narroBrowser } from './narro.vite';

export default defineConfig({
  plugins: [narroBrowser()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // Spike tests run only under vitest.spike.config.ts (they need Preact-compat
    // and signals-react bridge aliases that don't belong in the default suite).
    exclude: ['**/node_modules/**', 'src/spikes/**'],
    // Inlined so narro's own imports go through narroBrowser (Preact, stubs), as in the app.
    server: { deps: { inline: [/@getnarro/] } },
  },
});
