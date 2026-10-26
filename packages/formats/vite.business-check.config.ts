import { defineConfig } from 'vite';

// One self-contained file that runs in GitHub Actions without an install step.
export default defineConfig({
  build: {
    ssr: 'src/business/check-cli.ts',
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: { format: 'es', entryFileNames: 'business-check.mjs', inlineDynamicImports: true },
    },
  },
  ssr: { noExternal: true, target: 'node' },
});
