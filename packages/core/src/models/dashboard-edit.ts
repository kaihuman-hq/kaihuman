/**
 * Edits to `.dashboard.config.json` that the console and the mobile app share. They work on the
 * raw JSON, not on `parseDashboardConfig`'s typed copy, so fields and items this code does not
 * know (theme, navbar, files, future keys, hand-written extras) survive a round trip.
 */

export type DashboardEdit =
  | { type: 'addDashboard'; id: string; name: string }
  | { type: 'renameDashboard'; id: string; name: string }
  | { type: 'moveDashboard'; id: string; to: number }
  | { type: 'deleteDashboard'; id: string }
  | { type: 'addTile'; dashboard: string; path: string }
  | { type: 'removeTile'; dashboard: string; path: string }
  /** `paths` is the new order of the tiles the caller shows; entries it omits keep their slots. */
  | { type: 'reorderTiles'; dashboard: string; paths: readonly string[] }
  | { type: 'moveTile'; dashboard: string; path: string; to: string }
  | { type: 'hideTileOnMobile'; dashboard: string; path: string };

export type DashboardEditResult = { ok: true; text: string } | { ok: false; error: string };

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

const isDashboard = (v: unknown): v is Raw & { id: string; name: string } =>
  isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string';

const isEntry = (v: unknown): v is Raw & { path: string; dashboard: string } =>
  isRecord(v) && typeof v.path === 'string' && typeof v.dashboard === 'string';

// The console rewrites legacy `.lifeos/` paths on read, so callers only ever see `.kh/` ones.
const samePath = (entryPath: string, path: string) =>
  entryPath.replace(/^\.lifeos\//, '.kh/') === path.replace(/^\.lifeos\//, '.kh/');

const onTile = (e: unknown, dashboard: string, path: string): boolean =>
  isEntry(e) && e.dashboard === dashboard && samePath(e.path, path);

/** A new id in the console's `d<timestamp>` style that no dashboard in `text` uses yet. */
export function newDashboardId(text: string | null, now: number): string {
  const taken = new Set(readDashboardIds(text));
  let n = now;
  while (taken.has(`d${n}`)) n++;
  return `d${n}`;
}

function readDashboardIds(text: string | null): string[] {
  try {
    const raw = text ? JSON.parse(text) : null;
    return isRecord(raw) && Array.isArray(raw.dashboards)
      ? raw.dashboards.filter(isDashboard).map((d) => d.id)
      : [];
  } catch {
    return [];
  }
}

function base(text: string | null): Raw | string {
  if (!text?.trim()) return { version: 1, dashboards: [], entries: [], files: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // Saving over a file we cannot read would wipe whatever the user hand-wrote in it.
    return 'The dashboard config is not valid JSON. Fix it in the web console first.';
  }
  return isRecord(raw) ? { ...raw } : 'The dashboard config is not a JSON object.';
}

function apply(raw: Raw, edit: DashboardEdit): string | null {
  const all = Array.isArray(raw.dashboards) ? [...raw.dashboards] : [];
  // Mirrors parseDashboardConfig: no valid dashboard reads as one "Main", so editing one makes it real.
  const dashboards = all.some(isDashboard) ? all : [...all, { id: 'default', name: 'Main' }];
  const entries = Array.isArray(raw.entries) ? [...raw.entries] : [];
  const has = (id: string) => dashboards.some((d) => isDashboard(d) && d.id === id);
  const named = (name: string) => name.trim() || null;

  switch (edit.type) {
    case 'addDashboard': {
      const name = named(edit.name);
      if (!name) return 'Give the dashboard a name.';
      if (has(edit.id)) return 'That dashboard already exists.';
      dashboards.push({ id: edit.id, name });
      break;
    }
    case 'renameDashboard': {
      const name = named(edit.name);
      if (!name) return 'Give the dashboard a name.';
      if (!has(edit.id)) return 'That dashboard no longer exists.';
      const i = dashboards.findIndex((d) => isDashboard(d) && d.id === edit.id);
      dashboards[i] = { ...(dashboards[i] as Raw), name };
      break;
    }
    case 'moveDashboard': {
      const from = dashboards.findIndex((d) => isDashboard(d) && d.id === edit.id);
      if (from < 0) return 'That dashboard no longer exists.';
      const [item] = dashboards.splice(from, 1);
      dashboards.splice(Math.max(0, Math.min(edit.to, dashboards.length)), 0, item);
      break;
    }
    case 'deleteDashboard': {
      if (!has(edit.id)) return 'That dashboard no longer exists.';
      if (dashboards.filter(isDashboard).length <= 1) return 'Cannot delete the last dashboard.';
      dashboards.splice(
        dashboards.findIndex((d) => isDashboard(d) && d.id === edit.id),
        1,
      );
      // Its tiles' files stay in the repository; only their placement goes.
      raw.entries = entries.filter((e) => !(isEntry(e) && e.dashboard === edit.id));
      raw.dashboards = dashboards;
      return null;
    }
    case 'addTile': {
      if (!has(edit.dashboard)) return 'That dashboard no longer exists.';
      if (!entries.some((e) => onTile(e, edit.dashboard, edit.path))) {
        entries.push({ path: edit.path, dashboard: edit.dashboard });
      }
      break;
    }
    case 'removeTile': {
      raw.entries = entries.filter((e) => !onTile(e, edit.dashboard, edit.path));
      raw.dashboards = dashboards;
      return null;
    }
    case 'reorderTiles': {
      const wanted = edit.paths;
      const slots = entries.flatMap((e, i) =>
        isEntry(e) && e.dashboard === edit.dashboard && wanted.some((p) => samePath(e.path, p))
          ? [i]
          : [],
      );
      const ordered = wanted.flatMap((p) =>
        slots.map((i) => entries[i] as Raw & { path: string }).filter((e) => samePath(e.path, p)),
      );
      // Duplicates in `paths` would place an entry twice; refuse rather than write that.
      if (ordered.length !== slots.length) return 'The tile order is out of date.';
      slots.forEach((slot, k) => {
        entries[slot] = ordered[k];
      });
      break;
    }
    case 'moveTile': {
      if (!has(edit.to)) return 'That dashboard no longer exists.';
      const moving = entries.filter((e) => onTile(e, edit.dashboard, edit.path)) as Raw[];
      if (moving.length === 0) return 'That tile is no longer on this dashboard.';
      const rest = entries.filter((e) => !onTile(e, edit.dashboard, edit.path));
      const already = rest.some((e) => onTile(e, edit.to, edit.path));
      raw.entries = already ? rest : [...rest, { ...(moving[0] as Raw), dashboard: edit.to }];
      raw.dashboards = dashboards;
      return null;
    }
    case 'hideTileOnMobile': {
      let found = false;
      entries.forEach((e, i) => {
        if (onTile(e, edit.dashboard, edit.path)) {
          entries[i] = { ...(e as Raw), skipOnMobile: true };
          found = true;
        }
      });
      if (!found) return 'That tile is no longer on this dashboard.';
      break;
    }
  }
  raw.dashboards = dashboards;
  raw.entries = entries;
  return null;
}

/**
 * Applies `edits` in order to the config text (null when the file does not exist yet) and returns
 * the text to save, formatted the way the console writes it. Nothing is saved on the first error.
 */
export function applyDashboardEdits(
  text: string | null,
  edits: readonly DashboardEdit[],
): DashboardEditResult {
  const raw = base(text);
  if (typeof raw === 'string') return { ok: false, error: raw };
  for (const edit of edits) {
    const error = apply(raw, edit);
    if (error) return { ok: false, error };
  }
  return { ok: true, text: JSON.stringify(raw, null, 2) };
}
