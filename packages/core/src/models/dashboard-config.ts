import type { DashboardConfig } from './types.js';

export interface ResolvedDashboard {
  id: string;
  name: string;
  /** Tree paths in entry order. */
  paths: string[];
}

const DEFAULT_DASHBOARD = { id: 'default', name: 'Main' } as const;

const defaultConfig = (): DashboardConfig => ({
  version: 1,
  dashboards: [{ ...DEFAULT_DASHBOARD }],
  entries: [],
  files: {},
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Mirrors the console: anything unreadable falls back to one empty "Main" dashboard. Malformed
 * items are dropped one by one so a single hand-edit typo does not hide every other tile.
 */
export function parseDashboardConfig(text: string | null | undefined): DashboardConfig {
  if (!text) return defaultConfig();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultConfig();
  }
  if (!isRecord(raw)) return defaultConfig();

  const dashboards = (Array.isArray(raw.dashboards) ? raw.dashboards : []).flatMap((d) =>
    isRecord(d) && typeof d.id === 'string' && typeof d.name === 'string'
      ? [{ id: d.id, name: d.name }]
      : [],
  );
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).flatMap((e) => {
    if (!isRecord(e) || typeof e.path !== 'string' || typeof e.dashboard !== 'string') return [];
    return [
      {
        path: e.path,
        dashboard: e.dashboard,
        ...(e.skipOnMobile === true && { skipOnMobile: true }),
      },
    ];
  });
  return {
    ...defaultConfig(),
    version: typeof raw.version === 'number' ? raw.version : 1,
    dashboards: dashboards.length > 0 ? dashboards : [{ ...DEFAULT_DASHBOARD }],
    entries,
  };
}

/** `.kh` unless the repository still uses the legacy `.lifeos` folder (see `githubFileStore.appFolder`). */
export function appFolderFor(treePaths: readonly string[]): '.kh' | '.lifeos' {
  if (treePaths.some((p) => p.startsWith('.kh/'))) return '.kh';
  if (treePaths.some((p) => p.startsWith('.lifeos/'))) return '.lifeos';
  return '.kh';
}

export const dashboardConfigPath = (treePaths: readonly string[]): string =>
  `${appFolderFor(treePaths)}/.dashboard.config.json`;

/**
 * Applies the console's rules: legacy `.lifeos/` paths map to `.kh/`, entries whose file is not
 * in the tree vanish, and each dashboard keeps entry order. `mobile` also honours `skipOnMobile`.
 */
export function resolveDashboards(
  config: DashboardConfig,
  treePaths: readonly string[],
  opts: { mobile?: boolean } = {},
): ResolvedDashboard[] {
  const present = new Set(treePaths);
  const entries = config.entries
    .filter((e) => !(opts.mobile && e.skipOnMobile))
    .map((e) => ({ ...e, path: e.path.replace(/^\.lifeos\//, '.kh/') }))
    .filter((e) => present.has(e.path));
  return config.dashboards.map((d) => ({
    id: d.id,
    name: d.name,
    paths: entries.filter((e) => e.dashboard === d.id).map((e) => e.path),
  }));
}
