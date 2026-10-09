// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Absolute URLs for the canonical link and the link-preview tags in Layout.astro.
  site: 'https://kaihuman.com',
  vite: {
    plugins: [tailwindcss()]
  }
});
