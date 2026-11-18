import path from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { fontsourceDir, narroAliases } from './alias';

// Spike build/test config: bundles @getnarro/pdf for the browser on Preact.
// Build: NARRO_OUT=<dir> pnpm exec vite build --config src/spikes/narro/vite.config.ts
export default defineConfig({
  root: __dirname,
  plugins: [preact()],
  resolve: {
    alias: {
      ...narroAliases,
      '@narro-font-inter': fontsourceDir('inter'),
      '@narro-font-serif': fontsourceDir('source-serif-4'),
      '@narro-font-plex': fontsourceDir('ibm-plex-sans'),
    },
  },
  build: {
    outDir: process.env.NARRO_OUT ?? path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: { entry: path.resolve(__dirname, 'entry.ts'), formats: ['es'], fileName: 'narro-entry' },
    minify: true,
    assetsInlineLimit: 0, // keep woff2 as separate files; lib mode would otherwise base64 them into the JS
  },
});
