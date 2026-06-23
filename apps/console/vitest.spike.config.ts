import path from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

// Spike-only config: validates that Cascivo (a React/signals-react library)
// mounts under Preact via preact/compat + a signals-react -> signals bridge.
// The explicit react/* aliases must also reach the Cascivo dependency, so it is
// inlined (otherwise its internal `react/jsx-runtime` import resolves to real
// React, whose frozen elements break Preact's diff).
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      'react/jsx-runtime': 'preact/jsx-runtime',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      react: 'preact/compat',
      '@preact/signals-react/runtime': path.resolve(
        __dirname,
        'src/shims/signals-react-runtime.ts',
      ),
      '@preact/signals-react': '@preact/signals',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/spikes/**/*.spike.test.tsx'],
    server: {
      deps: {
        inline: [/@cascivo/],
      },
    },
  },
});
