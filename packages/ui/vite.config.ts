import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [preact(), dts({ include: ['src'] })],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat', // Must be below test-utils
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'preact',
        'preact/hooks',
        'preact/compat',
        'react',
        'react-dom',
        'tailwindcss',
        // Externalize heavy deps to let consumer bundle/tree-shake them
        'lucide-preact',
        'framer-motion',
        /^@dnd-kit\/.*/,
        'clsx',
        'tailwind-merge',
        '@lifosy/core',
        '@preact/signals',
        '@preact/signals-react',
        '@preact/signals-react/runtime',
        /^@cascivo\/.*/,
        'react-force-graph-2d',
        'highlight.js',
        'react-markdown',
        'rehype-highlight',
        'remark-gfm',
      ],
      output: {
        globals: {
          preact: 'Preact',
        },
      },
    },
    // Generate sourcemaps for better debugging
    sourcemap: true,
    // Reduce bloat
    minify: true,
  },
});
