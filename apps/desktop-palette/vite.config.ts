import { defineConfig } from 'vite';

export default defineConfig({
  // Tauri serves the build from its own protocol, so asset paths stay relative.
  base: './',
  build: {
    // WebKitGTK 2.4x runs everything ES2022 has, including the top-level await in main.ts.
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // Two pages: the palette overlay and the braindump window.
    rollupOptions: {
      input: { palette: 'index.html', braindump: 'braindump.html' },
    },
  },
});
