import { getCoreStorage } from '@kaihuman/core';
import { localDate } from '@kaihuman/formats';
import type { TileResult } from '../components/widgets/tile-controllers.js';
import type { IconName } from '../ui/index.js';
import type { Glance, GlanceTint } from '../views/tiles/glance/types.js';
import type { TileFile } from './dashboards.js';
import type { ContentFiles } from './file-editor-screen.js';

/**
 * Pure model of the ＋ quick menu (docs/redesign README decision 6): the Capture group, the Track
 * group built from the user's tiles, and the remembered last action with today's use count.
 */

export type CaptureKind = 'todo' | 'note' | 'log' | 'idea' | 'knowledge';

interface ActionLook {
  /** Stable key for usage counts and the remembered last action. */
  id: string;
  label: string;
  icon: IconName;
  tint: GlanceTint;
}

export type QuickMenuAction =
  /** Opens one of the existing quick-* sheets. */
  | (ActionLook & { kind: 'capture'; capture: CaptureKind; href: `/quick-${CaptureKind}` })
  /** Applies the tile's one-tap action to its file, no screen. */
  | (ActionLook & { kind: 'tap'; path: string })
  /** Opens the one-field sheet for the tile's file. */
  | (ActionLook & { kind: 'field'; path: string; href: string });

const capture = (
  kind: CaptureKind,
  label: string,
  icon: IconName,
  tint: GlanceTint,
): QuickMenuAction => ({
  kind: 'capture',
  id: `capture:${kind}`,
  capture: kind,
  label,
  icon,
  tint,
  href: `/quick-${kind}`,
});

export const CAPTURE_ACTIONS: readonly QuickMenuAction[] = [
  capture('todo', 'Todo', 'check', 'olive'),
  capture('note', 'Note', 'note', 'blue'),
  capture('log', 'Log', 'edit', 'purple'),
  capture('idea', 'Idea', 'ideas', 'orange'),
  capture('knowledge', 'Knowledge', 'knowledge', 'blue'),
];

export const quickEntryHref = (path: string): string =>
  `/quick-entry?path=${encodeURIComponent(path)}`;

/**
 * One Track entry per tile whose glance offers a one-tap or one-field action, in tile order.
 * `glanceFor` is injected so the model stays independent of the tile presenters.
 */
export function trackActions(
  files: readonly TileFile[],
  glanceFor: (file: TileFile) => Glance | null,
): QuickMenuAction[] {
  const seen = new Set<string>();
  return files.flatMap((file): QuickMenuAction[] => {
    if (seen.has(file.path)) return [];
    seen.add(file.path);
    const glance = file.content ? glanceFor(file) : null;
    const action = glance?.action;
    if (!glance || !action) return [];
    const look = { label: action.label, icon: glance.icon, tint: glance.tint };
    if (action.kind === 'tap')
      return [{ ...look, kind: 'tap', id: `tap:${file.path}`, path: file.path }];
    if (action.kind === 'field') {
      return [
        {
          ...look,
          kind: 'field',
          id: `field:${file.path}`,
          path: file.path,
          href: quickEntryHref(file.path),
        },
      ];
    }
    return [];
  });
}

// ─── Usage ──────────────────────────────────────────────────────────────────

export interface QuickUsage {
  /** Id of the last action run from the menu or by long-press. */
  last?: string;
  /** Local date the counts belong to; counts reset on a new day. */
  day: string;
  counts: Readonly<Record<string, number>>;
}

export const emptyUsage = (now: Date): QuickUsage => ({ day: localDate(now), counts: {} });

export function recordUse(usage: QuickUsage, id: string, now: Date): QuickUsage {
  const day = localDate(now);
  const counts = usage.day === day ? usage.counts : {};
  return { last: id, day, counts: { ...counts, [id]: (counts[id] ?? 0) + 1 } };
}

export const usesToday = (usage: QuickUsage, id: string, now: Date): number =>
  usage.day === localDate(now) ? (usage.counts[id] ?? 0) : 0;

/** The remembered action if it still exists (its tile may have been removed since). */
export const lastAction = (
  usage: QuickUsage,
  actions: readonly QuickMenuAction[],
): QuickMenuAction | null => actions.find((a) => a.id === usage.last) ?? null;

/** "used 4× today" for the bottom row; empty before the first use today. */
export const usageCaption = (count: number): string => (count > 0 ? `used ${count}× today` : '');

export function parseUsage(raw: string | null, now: Date): QuickUsage {
  if (!raw) return emptyUsage(now);
  try {
    const v = JSON.parse(raw) as Partial<QuickUsage>;
    if (typeof v.day !== 'string' || typeof v.counts !== 'object' || v.counts === null) {
      return emptyUsage(now);
    }
    const counts = Object.fromEntries(
      Object.entries(v.counts).filter((e): e is [string, number] => typeof e[1] === 'number'),
    );
    return { ...(typeof v.last === 'string' && { last: v.last }), day: v.day, counts };
  } catch {
    return emptyUsage(now);
  }
}

const USAGE_KEY = 'kh_mobile_quick_usage';

export function loadUsage(now: Date): QuickUsage {
  try {
    return parseUsage(getCoreStorage().getItem(USAGE_KEY), now);
  } catch {
    return emptyUsage(now);
  }
}

export function saveUsage(usage: QuickUsage): void {
  try {
    getCoreStorage().setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // A preference is not worth failing an action over.
  }
}

/** Tap actions may return plain text or a checked result; callers only handle the latter. */
export const asResult = (result: string | TileResult): TileResult =>
  typeof result === 'string' ? { ok: true, content: result } : result;

export interface QuickRunDeps {
  navigate: (href: string) => void;
  files: Pick<ContentFiles, 'read' | 'write'>;
  glanceFor: (file: TileFile) => Glance | null;
  now: Date;
}

export type QuickRunOutcome =
  | { kind: 'navigated' }
  | { kind: 'written'; path: string; content: string }
  | { kind: 'failed'; error: string };

/**
 * Runs one menu entry: capture and field entries navigate, a tap entry reads the tile's file,
 * re-derives its action from the current text (so it never applies to stale content) and writes.
 */
export async function performQuickAction(
  action: QuickMenuAction,
  { navigate, files, glanceFor, now }: QuickRunDeps,
): Promise<QuickRunOutcome> {
  if (action.kind !== 'tap') {
    navigate(action.href);
    return { kind: 'navigated' };
  }
  try {
    const content = await files.read(action.path);
    const tap = glanceFor({ path: action.path, content })?.action;
    if (tap?.kind !== 'tap') return { kind: 'failed', error: 'This tile has no quick action now' };
    const result = asResult(tap.run(content, now));
    if (!result.ok) return { kind: 'failed', error: result.error };
    await files.write(action.path, result.content);
    return { kind: 'written', path: action.path, content: result.content };
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : 'Could not save' };
  }
}
