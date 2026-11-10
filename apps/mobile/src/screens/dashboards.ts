import {
  dashboardConfigPath,
  getCoreStorage,
  parseDashboardConfig,
  resolveDashboards,
} from '@kaihuman/core';
import { tileKindForPath } from '../components/widgets/tile-controllers.js';
import type { ContentFiles } from './file-editor-screen.js';

export interface TileFile {
  path: string;
  /** Empty for files without a mobile tile; they render as "open file" placeholders. */
  content: string;
}

export interface DashboardPage {
  id: string;
  name: string;
  files: TileFile[];
}

const DASHBOARD_KEY = 'kh_mobile_dashboard';

export const lastDashboardId = (): string | null => {
  try {
    return getCoreStorage().getItem(DASHBOARD_KEY);
  } catch {
    return null;
  }
};

export const rememberDashboard = (id: string): void => {
  try {
    getCoreStorage().setItem(DASHBOARD_KEY, id);
  } catch {
    // A preference is not worth failing a swipe over.
  }
};

/**
 * Wraps `load` so only the most recently started call delivers. Loads overlap (a sync bumps the
 * revision while one is still reading), and an older one finishing last must not overwrite the
 * newer pages; superseded calls resolve to null, their errors included.
 */
export function takeLatest<T>(load: () => Promise<T>): () => Promise<T | null> {
  let latest = 0;
  return async () => {
    const mine = ++latest;
    try {
      const value = await load();
      return mine === latest ? value : null;
    } catch (err) {
      if (mine === latest) throw err;
      return null;
    }
  };
}

/**
 * The user's console dashboards as pages. Without a config (or one that places nothing) every
 * tile file in the repository shows on a single "Today" page, which is what the app did before
 * dashboards existed; `defaulted` lets the view explain how to get real pages.
 */
export async function loadDashboards(
  files: ContentFiles,
): Promise<{ pages: DashboardPage[]; defaulted: boolean }> {
  const tree = files
    .tree()
    .filter((i) => i.type !== 'tree')
    .map((i) => i.path);

  // A config that exists but cannot be read right now is not a missing config: falling back to
  // the single "Today" page made the pager lose its other pages (and swiping) until the next
  // change. Throw instead, so the screen keeps the pages it already shows.
  const configPath = dashboardConfigPath(tree);
  const configText = tree.includes(configPath) ? await files.read(configPath) : null;
  const resolved = resolveDashboards(parseDashboardConfig(configText), tree, { mobile: true });
  const defaulted = resolved.every((d) => d.paths.length === 0);
  const layout = defaulted
    ? [
        {
          id: 'today',
          name: 'Today',
          paths: tree.filter((p) => tileKindForPath(p)).sort(),
        },
      ]
    : resolved;

  // A file can sit on several dashboards but is fetched once.
  const content = new Map<string, string | null>();
  await Promise.all(
    [...new Set(layout.flatMap((d) => d.paths))].map(async (path) => {
      if (!tileKindForPath(path)) return content.set(path, '');
      try {
        content.set(path, await files.read(path));
      } catch {
        content.set(path, null);
      }
    }),
  );
  const pages = layout.map((d) => ({
    id: d.id,
    name: d.name,
    files: d.paths.flatMap((path): TileFile[] => {
      const text = content.get(path);
      return typeof text === 'string' ? [{ path, content: text }] : [];
    }),
  }));
  return { pages, defaulted };
}
