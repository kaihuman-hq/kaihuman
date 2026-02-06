import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    preact(),
    dts({ include: ['src'] })
  ],
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
        /^@codemirror\/.*/,
        /^@dnd-kit\/.*/,
        'clsx',
        'tailwind-merge',
        '@lifosy/core',
        '@preact/signals',
        'react-force-graph-2d',
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
