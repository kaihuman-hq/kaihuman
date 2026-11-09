import { defineConfig } from 'vitest/config';

// Render tests (*.test.tsx) run React Native views through react-native-web in jsdom;
// the controller tests (*.test.ts) stay in plain node.
const alias = { 'react-native': 'react-native-web' };
const define = { __DEV__: 'true' };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        define,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'plugins/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        define,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/ui/test-setup.ts'],
          // A full jsdom render of a tile or dashboard takes ~1s locally and 5s+ on a 2-CPU CI runner
          // shared with the other packages' suites; the default 5s limit timed out there.
          testTimeout: 20_000,
        },
      },
    ],
  },
});
