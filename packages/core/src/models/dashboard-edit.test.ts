import { describe, expect, it } from 'vitest';
import { parseDashboardConfig, resolveDashboards } from './dashboard-config.js';
import { applyDashboardEdits, type DashboardEdit, newDashboardId } from './dashboard-edit.js';

const CONFIG = JSON.stringify({
  version: 1,
  theme: 'amethyst',
  navbar: ['dashboard', 'files'],
  files: { recentlyOpened: ['.kh/a.todos.md'], quickNotes: ['.kh/n.md'] },
  future: { keep: true },
  dashboards: [
    { id: 'main', name: 'Main', icon: 'sun' },
    { id: 'fin', name: 'Finance' },
  ],
  entries: [
    { path: '.kh/a.todos.md', dashboard: 'main', skipOnMobile: false, size: 'L' },
    { path: '.kh/web.csv', dashboard: 'main', skipOnMobile: true },
    { path: '.lifeos/b.habit.csv', dashboard: 'main' },
    { path: '.kh/c.budget.csv', dashboard: 'fin' },
    { path: '.kh/d.events.csv', dashboard: 'main' },
  ],
});

const edit = (text: string | null, ...edits: DashboardEdit[]) => {
  const r = applyDashboardEdits(text, edits);
  if (!r.ok) throw new Error(r.error);
  return JSON.parse(r.text);
};
const error = (text: string | null, ...edits: DashboardEdit[]) => {
  const r = applyDashboardEdits(text, edits);
  return r.ok ? null : r.error;
};
const pathsOf = (cfg: unknown, id: string) =>
  resolveDashboards(
    parseDashboardConfig(JSON.stringify(cfg)),
    [
      '.kh/a.todos.md',
      '.kh/web.csv',
      '.kh/b.habit.csv',
      '.kh/c.budget.csv',
      '.kh/d.events.csv',
      '.kh/e.rss.json',
    ],
    { mobile: true },
  ).find((d) => d.id === id)?.paths;

describe('applyDashboardEdits', () => {
  it('keeps fields and items it does not know through an edit', () => {
    const out = edit(CONFIG, { type: 'renameDashboard', id: 'fin', name: 'Money' });
    const before = JSON.parse(CONFIG);
    expect(out).toEqual({
      ...before,
      dashboards: [before.dashboards[0], { id: 'fin', name: 'Money' }],
    });
  });

  it('writes the console format (two-space JSON)', () => {
    const r = applyDashboardEdits(CONFIG, []);
    expect(r).toEqual({ ok: true, text: JSON.stringify(JSON.parse(CONFIG), null, 2) });
  });

  it('refuses to overwrite a config that is not valid JSON', () => {
    expect(error('{oops', { type: 'addTile', dashboard: 'default', path: 'x.todos.md' })).toMatch(
      /not valid JSON/,
    );
    expect(error('[1]')).toMatch(/not a JSON object/);
  });

  it('creates a config from nothing, starting with the implicit Main dashboard', () => {
    const out = edit(null, { type: 'addTile', dashboard: 'default', path: '.kh/a.todos.md' });
    expect(out.dashboards).toEqual([{ id: 'default', name: 'Main' }]);
    expect(out.entries).toEqual([{ path: '.kh/a.todos.md', dashboard: 'default' }]);
  });

  describe('dashboards', () => {
    it('adds, renames, moves and deletes', () => {
      let out = edit(CONFIG, { type: 'addDashboard', id: 'd1', name: '  Reading ' });
      expect(out.dashboards.map((d: { name: string }) => d.name)).toEqual([
        'Main',
        'Finance',
        'Reading',
      ]);
      out = edit(JSON.stringify(out), { type: 'moveDashboard', id: 'd1', to: 0 });
      expect(out.dashboards.map((d: { id: string }) => d.id)).toEqual(['d1', 'main', 'fin']);
      out = edit(JSON.stringify(out), { type: 'moveDashboard', id: 'd1', to: 99 });
      expect(out.dashboards.map((d: { id: string }) => d.id)).toEqual(['main', 'fin', 'd1']);
      out = edit(JSON.stringify(out), { type: 'deleteDashboard', id: 'fin' });
      expect(out.dashboards.map((d: { id: string }) => d.id)).toEqual(['main', 'd1']);
      expect(out.entries.some((e: { dashboard: string }) => e.dashboard === 'fin')).toBe(false);
      expect(out.entries).toHaveLength(4);
    });

    it('rejects empty names, duplicates, missing ids and deleting the last one', () => {
      expect(error(CONFIG, { type: 'addDashboard', id: 'x', name: '  ' })).toMatch(/name/);
      expect(error(CONFIG, { type: 'addDashboard', id: 'fin', name: 'F' })).toMatch(/exists/);
      expect(error(CONFIG, { type: 'renameDashboard', id: 'nope', name: 'F' })).toMatch(
        /no longer/,
      );
      expect(
        error(
          CONFIG,
          { type: 'deleteDashboard', id: 'fin' },
          { type: 'deleteDashboard', id: 'main' },
        ),
      ).toMatch(/last/);
    });

    it('newDashboardId skips ids already taken', () => {
      const text = JSON.stringify({
        dashboards: [
          { id: 'd5', name: 'A' },
          { id: 'd6', name: 'B' },
        ],
      });
      expect(newDashboardId(text, 5)).toBe('d7');
      expect(newDashboardId(null, 5)).toBe('d5');
      expect(newDashboardId('{bad', 5)).toBe('d5');
    });
  });

  describe('tiles', () => {
    it('adds once per dashboard and removes', () => {
      let out = edit(CONFIG, { type: 'addTile', dashboard: 'main', path: '.kh/e.rss.json' });
      expect(pathsOf(out, 'main')).toEqual([
        '.kh/a.todos.md',
        '.kh/b.habit.csv',
        '.kh/d.events.csv',
        '.kh/e.rss.json',
      ]);
      expect(
        edit(JSON.stringify(out), { type: 'addTile', dashboard: 'main', path: '.kh/e.rss.json' })
          .entries,
      ).toHaveLength(out.entries.length);
      // A legacy .lifeos path is the same tile as its .kh form.
      out = edit(CONFIG, { type: 'removeTile', dashboard: 'main', path: '.kh/b.habit.csv' });
      expect(pathsOf(out, 'main')).toEqual(['.kh/a.todos.md', '.kh/d.events.csv']);
      expect(error(CONFIG, { type: 'addTile', dashboard: 'nope', path: 'x' })).toMatch(/no longer/);
    });

    it('reorders the shown tiles and leaves hidden entries in their slots', () => {
      const out = edit(CONFIG, {
        type: 'reorderTiles',
        dashboard: 'main',
        paths: ['.kh/d.events.csv', '.kh/a.todos.md', '.kh/b.habit.csv'],
      });
      expect(pathsOf(out, 'main')).toEqual([
        '.kh/d.events.csv',
        '.kh/a.todos.md',
        '.kh/b.habit.csv',
      ]);
      expect(out.entries[1]).toEqual({
        path: '.kh/web.csv',
        dashboard: 'main',
        skipOnMobile: true,
      });
      expect(out.entries[3]).toEqual({ path: '.kh/c.budget.csv', dashboard: 'fin' });
      // Entries keep their own fields when they move.
      expect(out.entries[2]).toEqual({
        path: '.kh/a.todos.md',
        dashboard: 'main',
        skipOnMobile: false,
        size: 'L',
      });
      // The stored legacy path is not rewritten by a reorder.
      expect(out.entries[4]).toEqual({ path: '.lifeos/b.habit.csv', dashboard: 'main' });
    });

    it('refuses an order that lists a tile twice', () => {
      expect(
        error(CONFIG, {
          type: 'reorderTiles',
          dashboard: 'main',
          paths: ['.kh/a.todos.md', '.kh/a.todos.md'],
        }),
      ).toMatch(/out of date/);
    });

    it('moves a tile to another dashboard, keeping its fields', () => {
      const out = edit(CONFIG, {
        type: 'moveTile',
        dashboard: 'main',
        path: '.kh/a.todos.md',
        to: 'fin',
      });
      expect(pathsOf(out, 'main')).toEqual(['.kh/b.habit.csv', '.kh/d.events.csv']);
      expect(pathsOf(out, 'fin')).toEqual(['.kh/c.budget.csv', '.kh/a.todos.md']);
      expect(out.entries.at(-1)).toEqual({
        path: '.kh/a.todos.md',
        dashboard: 'fin',
        skipOnMobile: false,
        size: 'L',
      });
      expect(error(CONFIG, { type: 'moveTile', dashboard: 'main', path: 'zz', to: 'fin' })).toMatch(
        /no longer/,
      );
    });

    it('hides a tile on mobile only', () => {
      const out = edit(CONFIG, {
        type: 'hideTileOnMobile',
        dashboard: 'main',
        path: '.kh/d.events.csv',
      });
      expect(pathsOf(out, 'main')).toEqual(['.kh/a.todos.md', '.kh/b.habit.csv']);
      expect(out.entries[4]).toEqual({
        path: '.kh/d.events.csv',
        dashboard: 'main',
        skipOnMobile: true,
      });
    });

    it('applies nothing when a later edit fails', () => {
      expect(
        applyDashboardEdits(CONFIG, [
          { type: 'addTile', dashboard: 'main', path: 'x.todos.md' },
          { type: 'deleteDashboard', id: 'nope' },
        ]).ok,
      ).toBe(false);
    });
  });
});
