import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Run: pnpm exec vitest run --config src/spikes/narro/vitest.config.ts
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['**/*.spike.test.ts'],
      server: { deps: { inline: [/@getnarro/] } },
    },
  }),
);
