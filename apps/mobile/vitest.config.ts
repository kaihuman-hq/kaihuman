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
          include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        define,
        test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.test.tsx'] },
      },
    ],
  },
});
