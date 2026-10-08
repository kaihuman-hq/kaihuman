import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// The site renders the same Markdown that ships as @kaihuman/docspack, so the
// human-readable docs and the agent index never drift apart.
const docs = defineCollection({
  loader: glob({
    pattern: '*.md',
    base: '../../packages/docspack/docs',
    generateId: ({ entry }) => entry.replace(/^\d+-/, '').replace(/\.md$/, ''),
  }),
});

export const collections = { docs };
