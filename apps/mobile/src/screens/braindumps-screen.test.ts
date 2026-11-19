import { describe, expect, it } from 'vitest';
import { BraindumpsScreenController } from './braindumps-screen.js';
import type { ContentFiles } from './file-editor-screen.js';

const files = (contents: Record<string, string>): ContentFiles =>
  ({
    refresh: async () => {},
    tree: () => Object.keys(contents).map((path) => ({ path, type: 'blob' })),
    read: async (p: string) => contents[p] ?? '',
  }) as unknown as ContentFiles;

describe('BraindumpsScreenController', () => {
  it('lists only braindump files, newest first, titled by their first line', async () => {
    const c = new BraindumpsScreenController({
      files: files({
        '.kh/braindumps/100.md': '# Old one\nbody',
        '.kh/braindumps/300.md': 'Newest',
        '.kh/braindumps/sub/200.md': 'nested',
        '.kh/ideas/x.md': 'idea',
      }),
    });
    await c.load();
    expect(c.items().map((i) => [i.path, i.title])).toEqual([
      ['.kh/braindumps/300.md', 'Newest'],
      ['.kh/braindumps/100.md', 'Old one'],
    ]);
  });

  it('falls back to the id when a file cannot be read', async () => {
    const f = files({ '.kh/braindumps/5.md': 'x' });
    f.read = async () => {
      throw new Error('offline');
    };
    const c = new BraindumpsScreenController({ files: f });
    await c.load();
    expect(c.items()[0]?.title).toBe('5.md');
  });
});
