import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    preact(),
    dts({ include: ['src'] })
  ],
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
    minify: false,
  },
});
