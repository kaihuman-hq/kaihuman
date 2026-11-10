import { describe, expect, it, vi } from 'vitest';
import { loadPaletteSettings } from './settings.js';

const fake = (paths: string[], afterRefresh: string[] = paths) => {
  let tree = paths;
  return {
    tree: () => tree.map((path) => ({ path, type: 'blob' }) as never),
    refresh: vi.fn(async () => {
      tree = afterRefresh;
    }),
    read: vi.fn(async (p: string) => `content of ${p}`),
  };
};

describe('loadPaletteSettings', () => {
  it('reads the command palette settings file from the tree', async () => {
    const files = fake(['.kh/a.todos.md', '.kh/command-palette.settings.json']);
    expect(await loadPaletteSettings(files)).toEqual({
      path: '.kh/command-palette.settings.json',
      content: 'content of .kh/command-palette.settings.json',
    });
    expect(files.refresh).not.toHaveBeenCalled();
  });

  it('refreshes once when the tree has not loaded it yet', async () => {
    const files = fake([], ['command-palette.settings.json']);
    expect((await loadPaletteSettings(files))?.path).toBe('command-palette.settings.json');
    expect(files.refresh).toHaveBeenCalledOnce();
  });

  it('is null when the repository has no settings file', async () => {
    expect(await loadPaletteSettings(fake(['.kh/a.todos.md']))).toBeNull();
  });
});
