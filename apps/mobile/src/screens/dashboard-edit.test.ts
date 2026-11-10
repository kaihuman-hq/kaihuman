import { describe, expect, it, vi } from 'vitest';
import { tileKindForPath } from '../components/widgets/tile-controllers.js';
import {
  dropIndex,
  filesOfKind,
  moveItem,
  NEW_TILE_FILES,
  newTileFile,
  nextDashboardId,
  retargetFallback,
  saveDashboardEdits,
} from './dashboard-edit.js';
import { loadDashboards } from './dashboards.js';
import type { ContentFiles } from './file-editor-screen.js';

const CONFIG = '.kh/.dashboard.config.json';

function memFiles(initial: Record<string, string>) {
  const store = { ...initial };
  const files = {
    tree: () => Object.keys(store).map((path) => ({ path, type: 'blob' }) as never),
    read: async (p: string) => {
      if (!(p in store)) throw new Error(`missing ${p}`);
      return store[p] as string;
    },
    write: vi.fn(async (p: string, c: string) => {
      if (!(p in store)) throw new Error(`write to missing ${p}`);
      store[p] = c;
    }),
    create: vi.fn(async (p: string, c: string) => {
      if (p in store) throw new Error('exists');
      store[p] = c;
    }),
  } as unknown as ContentFiles & {
    write: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  return { files, store };
}

describe('saveDashboardEdits', () => {
  it('edits the existing config in place and keeps unknown fields', async () => {
    const config = {
      version: 1,
      theme: 'light',
      navbar: ['files'],
      files: { recentlyOpened: ['.kh/a.todos.md'] },
      dashboards: [{ id: 'm', name: 'Main' }],
      entries: [
        { path: '.kh/a.todos.md', dashboard: 'm' },
        { path: '.kh/b.habit.csv', dashboard: 'm' },
      ],
    };
    const { files, store } = memFiles({
      [CONFIG]: JSON.stringify(config),
      '.kh/a.todos.md': '',
      '.kh/b.habit.csv': '',
    });
    await saveDashboardEdits(files, [
      { type: 'reorderTiles', dashboard: 'm', paths: ['.kh/b.habit.csv', '.kh/a.todos.md'] },
    ]);
    expect(files.create).not.toHaveBeenCalled();
    const saved = JSON.parse(store[CONFIG] as string);
    expect(saved).toEqual({ ...config, entries: [config.entries[1], config.entries[0]] });
    const { pages } = await loadDashboards(files);
    expect(pages[0]?.files.map((f) => f.path)).toEqual(['.kh/b.habit.csv', '.kh/a.todos.md']);
  });

  it('skips the write when nothing changes', async () => {
    const text = JSON.stringify({ dashboards: [{ id: 'm', name: 'Main' }], entries: [] }, null, 2);
    const { files } = memFiles({ [CONFIG]: text });
    await saveDashboardEdits(files, [{ type: 'renameDashboard', id: 'm', name: 'Main' }]);
    expect(files.write).not.toHaveBeenCalled();
  });

  it('creates the config when the repository has none, keeping the fallback page tiles', async () => {
    const { files, store } = memFiles({ '.kh/a.todos.md': '', '.kh/b.habit.csv': '' });
    const before = await loadDashboards(files);
    expect(before.defaulted).toBe(true);
    await saveDashboardEdits(
      files,
      [{ type: 'removeTile', dashboard: 'today', path: '.kh/a.todos.md' }],
      { shown: before.pages[0]?.files.map((f) => f.path) ?? [] },
    );
    expect(files.create).toHaveBeenCalledOnce();
    const after = await loadDashboards(files);
    expect(after.defaulted).toBe(false);
    expect(after.pages.map((p) => [p.name, p.files.map((f) => f.path)])).toEqual([
      ['Main', ['.kh/b.habit.csv']],
    ]);
    expect(JSON.parse(store[CONFIG] as string).files).toEqual({});
  });

  it('throws the edit error and writes nothing', async () => {
    const { files } = memFiles({ [CONFIG]: '{broken' });
    await expect(
      saveDashboardEdits(files, [{ type: 'addDashboard', id: 'x', name: 'X' }]),
    ).rejects.toThrow(/not valid JSON/);
    expect(files.write).not.toHaveBeenCalled();
  });

  it('nextDashboardId avoids ids in the saved config', async () => {
    const { files } = memFiles({
      [CONFIG]: JSON.stringify({ dashboards: [{ id: 'd1', name: 'A' }] }),
    });
    expect(await nextDashboardId(files, 1)).toBe('d2');
  });
});

describe('retargetFallback', () => {
  it('places shown tiles on the first dashboard and retargets the edits', () => {
    const text = JSON.stringify({ dashboards: [{ id: 'x', name: 'X' }], entries: [] });
    expect(
      retargetFallback(
        text,
        ['a.todos.md'],
        [
          { type: 'moveTile', dashboard: 'today', path: 'a.todos.md', to: 'd9' },
          { type: 'renameDashboard', id: 'today', name: 'Home' },
          { type: 'addDashboard', id: 'd9', name: 'New' },
        ],
      ),
    ).toEqual([
      { type: 'addTile', dashboard: 'x', path: 'a.todos.md' },
      { type: 'moveTile', dashboard: 'x', path: 'a.todos.md', to: 'd9' },
      { type: 'renameDashboard', id: 'x', name: 'Home' },
      { type: 'addDashboard', id: 'd9', name: 'New' },
    ]);
  });
});

describe('new tile files', () => {
  it('every offered kind has a suffix that renders as that kind', () => {
    for (const s of NEW_TILE_FILES) expect(tileKindForPath(`x${s.suffix}`)).toBe(s.kind);
  });

  it('builds the path in the app folder and validates the name', () => {
    const tree = ['.kh/a.todos.md'];
    expect(newTileFile(tree, 'todos', ' work ')).toEqual({
      ok: true,
      path: '.kh/work.todos.md',
      content: '- [ ] New Task',
    });
    expect(newTileFile(tree, 'todos', 'work.todos.md')).toMatchObject({
      path: '.kh/work.todos.md',
    });
    expect(newTileFile(['.lifeos/x.md'], 'habit', 'gym')).toMatchObject({
      path: '.lifeos/gym.habit.csv',
    });
    expect(newTileFile(tree, 'todos', 'a')).toMatchObject({ ok: false, error: /exists/ });
    expect(newTileFile(tree, 'todos', '  ')).toMatchObject({ ok: false });
    expect(newTileFile(tree, 'todos', '../x')).toMatchObject({ ok: false });
    expect(newTileFile(tree, 'palettesettings', 'p')).toMatchObject({ ok: false });
  });

  it('filesOfKind lists matching files sorted', () => {
    expect(filesOfKind(['b.todos.md', 'x.md', 'a.todos.md', 'c.habit.csv'], 'todos')).toEqual([
      'a.todos.md',
      'b.todos.md',
    ]);
  });
});

describe('drag helpers', () => {
  const list = { count: 5, columns: 1, cellWidth: 300, cellHeight: 60, gap: 10 };
  const grid = { count: 5, columns: 2, cellWidth: 170, cellHeight: 170, gap: 13 };

  it('dropIndex moves by whole rows in a list and clamps', () => {
    expect(dropIndex(1, { dx: 0, dy: 0 }, list)).toBe(1);
    expect(dropIndex(1, { dx: 0, dy: 140 }, list)).toBe(3);
    expect(dropIndex(1, { dx: 0, dy: 30 }, list)).toBe(1);
    expect(dropIndex(1, { dx: 999, dy: -999 }, list)).toBe(0);
    expect(dropIndex(1, { dx: 0, dy: 999 }, list)).toBe(4);
    expect(dropIndex(0, { dx: 0, dy: 99 }, { ...list, count: 1 })).toBe(0);
  });

  it('dropIndex moves across columns and rows in a grid', () => {
    expect(dropIndex(0, { dx: 183, dy: 0 }, grid)).toBe(1);
    expect(dropIndex(0, { dx: 183, dy: 183 }, grid)).toBe(3);
    expect(dropIndex(1, { dx: 500, dy: 0 }, grid)).toBe(1);
    expect(dropIndex(3, { dx: 0, dy: 400 }, grid)).toBe(4);
  });

  it('moveItem moves one item and clamps', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
  });
});
