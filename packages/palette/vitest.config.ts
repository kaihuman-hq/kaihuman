import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The palette renders into a shadow root, so its tests need a DOM.
    environment: 'jsdom',
  },
});
