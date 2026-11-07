import { buildDemoSeed } from '@kaihuman/core';
import { describe, expect, it } from 'vitest';
import type { RepoFiles } from './quick-capture.js';
import { TodoAnalyticsController } from './todo-analytics.js';

describe('demo data in todo analytics', () => {
  it('produces a multi-week velocity chart', async () => {
    const now = new Date();
    const { files } = buildDemoSeed(now);
    const repo: RepoFiles = {
      appFolder: () => '.kh',
      exists: (p) => p in files,
      todoPaths: () => Object.keys(files).filter((p) => p.endsWith('.todos.md')),
      read: async (p) => files[p] ?? null,
      write: async () => {},
    };
    const analytics = new TodoAnalyticsController(repo, () => now);
    await analytics.load();
    const velocity = analytics.velocity('13W');
    expect(velocity.filter((v) => v.count > 0).length).toBeGreaterThanOrEqual(4);
    expect(velocity.reduce((n, v) => n + v.count, 0)).toBeGreaterThanOrEqual(8);
  });
});
