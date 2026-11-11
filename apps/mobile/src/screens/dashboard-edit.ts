import {
  appFolderFor,
  applyDashboardEdits,
  type DashboardEdit,
  dashboardConfigPath,
  newDashboardId,
  parseDashboardConfig,
} from '@kaihuman/core';
import { parseTravel, serializeTravel } from '@kaihuman/formats';
import { type TileKind, tileKindForPath } from '../components/widgets/tile-controllers.js';
import { type CreateSpec, resolveTarget, tileSpec } from '../files/create-target.js';
import type { ContentFiles } from './file-editor-screen.js';

export type { DashboardEdit } from '@kaihuman/core';

/** Id of the fallback page `loadDashboards` shows when the config places no tile. */
export const FALLBACK_PAGE_ID = 'today';

/**
 * Kinds the add-tile picker offers, with the suffix and starting text of a new file. Starters
 * match the web console's new-file wizard so both apps create the same files. Palette settings
 * is one fixed file that the redesign moves out of the dashboard, so it is not offered.
 */
export const NEW_TILE_FILES: readonly { kind: TileKind; suffix: string; starter: string }[] = [
  { kind: 'todos', suffix: '.todos.md', starter: '- [ ] New Task' },
  { kind: 'habit', suffix: '.habit.csv', starter: 'id,title,frequency,target,history\n' },
  { kind: 'timetracking', suffix: '.timetracking.csv', starter: '' },
  { kind: 'events', suffix: '.events.csv', starter: 'id,title,date,type,description\n' },
  { kind: 'actionlog', suffix: '.actionlog.md', starter: '---\n---\n\n# Action Log\n\n' },
  { kind: 'timezones', suffix: '.timezones.json', starter: '[]' },
  {
    kind: 'readitlater',
    suffix: '.readitlater.json',
    starter: JSON.stringify({ items: [] }, null, 2),
  },
  {
    kind: 'bookmarks',
    suffix: '.bookmarks.json',
    starter: JSON.stringify({ bookmarks: [], updatedAt: '' }, null, 2),
  },
  { kind: 'budget', suffix: '.budget.csv', starter: '' },
  { kind: 'stocks', suffix: '.stocks.csv', starter: '' },
  { kind: 'consumption', suffix: '.consumption.csv', starter: 'created\n' },
  {
    kind: 'datacollection',
    suffix: '.data-collection.csv',
    starter: 'name::created,type::auto:date;name::Value,type::number,unit::#\n',
  },
  { kind: 'prompts', suffix: '.prompts.md', starter: '# Prompts\n' },
  { kind: 'commands', suffix: '.commands.md', starter: '# Commands\n' },
  {
    kind: 'rss',
    suffix: '.rss.json',
    starter: JSON.stringify({ feeds: [], readItems: [] }, null, 2),
  },
  { kind: 'travel', suffix: '.travel.json', starter: serializeTravel(parseTravel('')) },
  { kind: 'boardoverview', suffix: '.board-overview.json', starter: '{}' },
];

/** Repository files that render as `kind`, sorted, for the "use an existing file" list. */
export const filesOfKind = (tree: readonly string[], kind: TileKind): string[] =>
  tree.filter((p) => tileKindForPath(p) === kind).sort();

export type NewTileFile =
  | { ok: true; path: string; content: string }
  | { ok: false; error: string };

/** Folder and name rules for a new `kind` tile file, or null when mobile cannot create it. */
export const tileCreateSpec = (kind: TileKind): CreateSpec | null => {
  const spec = NEW_TILE_FILES.find((s) => s.kind === kind);
  return spec ? tileSpec(kind, spec.suffix) : null;
};

/** Path and starting text for a new `kind` file called `name`, in `folder` (the app folder by default). */
export function newTileFile(
  tree: readonly string[],
  kind: TileKind,
  name: string,
  folder: string = appFolderFor(tree),
): NewTileFile {
  const spec = NEW_TILE_FILES.find((s) => s.kind === kind);
  const create = tileCreateSpec(kind);
  if (!spec || !create)
    return { ok: false, error: 'This kind of tile cannot be created on mobile.' };
  const target = resolveTarget(create, { folder, name }, tree);
  return target.ok ? { ok: true, path: target.path, content: spec.starter } : target;
}

/**
 * Where a dragged item lands: `from` moved by `offset` (pixels along the drag) in a grid of
 * `columns` cells, each `cell` pixels plus `gap` apart per row and per column. A list is one
 * column, the square-grid layout two; dx is ignored for a single column.
 */
export function dropIndex(
  from: number,
  offset: { dx: number; dy: number },
  layout: { count: number; columns: number; cellWidth: number; cellHeight: number; gap: number },
): number {
  const { count, columns, cellWidth, cellHeight, gap } = layout;
  if (count <= 1) return 0;
  const row = Math.floor(from / columns) + Math.round(offset.dy / (cellHeight + gap));
  const col = (from % columns) + (columns > 1 ? Math.round(offset.dx / (cellWidth + gap)) : 0);
  const clampedCol = Math.max(0, Math.min(columns - 1, col));
  return Math.max(0, Math.min(count - 1, row * columns + clampedCol));
}

/** `items` with the one at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1) as [T];
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

/**
 * Edits to send for the fallback page: it is not in the config, so its tiles are first placed on
 * the config's first dashboard (in the order shown) and the edits retargeted there. After this
 * save the config places tiles and the app shows the real dashboards.
 */
export function retargetFallback(
  text: string | null,
  shown: readonly string[],
  edits: readonly DashboardEdit[],
): DashboardEdit[] {
  const target = (parseDashboardConfig(text).dashboards[0] as { id: string }).id;
  const swap = (id: string) => (id === FALLBACK_PAGE_ID ? target : id);
  const retargeted = edits.map((e): DashboardEdit => {
    switch (e.type) {
      case 'addDashboard':
        return e;
      case 'renameDashboard':
      case 'moveDashboard':
      case 'deleteDashboard':
        return { ...e, id: swap(e.id) };
      case 'moveTile':
        return { ...e, dashboard: swap(e.dashboard), to: swap(e.to) };
      default:
        return { ...e, dashboard: swap(e.dashboard) };
    }
  });
  return [
    ...shown.map((path): DashboardEdit => ({ type: 'addTile', dashboard: target, path })),
    ...retargeted,
  ];
}

async function readConfig(files: ContentFiles): Promise<{ path: string; text: string | null }> {
  const tree = files
    .tree()
    .filter((i) => i.type !== 'tree')
    .map((i) => i.path);
  const path = dashboardConfigPath(tree);
  return { path, text: tree.includes(path) ? await files.read(path) : null };
}

/** A fresh dashboard id that the current config does not use. */
export async function nextDashboardId(files: ContentFiles, now = Date.now()): Promise<string> {
  return newDashboardId((await readConfig(files)).text, now);
}

/**
 * Applies `edits` to the latest config and saves it through the normal write path (the sync
 * engine pushes it). Re-reading first means a change synced from the web since the screen loaded
 * is edited, not overwritten. `fallback` carries the tiles of the fallback page when it is shown.
 */
export async function saveDashboardEdits(
  files: ContentFiles,
  edits: readonly DashboardEdit[],
  fallback?: { shown: readonly string[] },
): Promise<void> {
  const { path, text } = await readConfig(files);
  const all = fallback ? retargetFallback(text, fallback.shown, edits) : edits;
  const result = applyDashboardEdits(text, all);
  if (!result.ok) throw new Error(result.error);
  if (text === null) await files.create(path, result.text);
  else if (result.text !== text) await files.write(path, result.text);
}
