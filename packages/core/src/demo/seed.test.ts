import { parseTodos } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { buildDemoSeed } from './seed.js';

const DAY_MS = 86_400_000;

describe('demo seed todos', () => {
  it('gives done items past completion dates spread across at least four recent weeks', () => {
    const now = new Date(2026, 10, 6, 12, 0, 0);
    const { files } = buildDemoSeed(now);
    const done = Object.entries(files)
      .filter(([path]) => path.endsWith('.todos.md'))
      .flatMap(([, content]) => parseTodos(content).items)
      .filter((i) => i.status === 'done');

    expect(done.length).toBeGreaterThanOrEqual(8);
    expect(done.length).toBeLessThanOrEqual(20);
    for (const item of done) {
      expect(item.updatedAt).toBeDefined();
      expect(item.updatedAt as number).toBeLessThan(now.getTime());
      expect(item.updatedAt as number).toBeGreaterThan(now.getTime() - 60 * DAY_MS);
    }
    // Monday-based week buckets are enough to count distinct weeks.
    const weeks = new Set(done.map((i) => Math.floor(((i.updatedAt as number) / DAY_MS + 3) / 7)));
    expect(weeks.size).toBeGreaterThanOrEqual(4);
  });
});
