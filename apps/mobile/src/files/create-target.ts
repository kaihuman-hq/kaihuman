import { getCoreStorage } from '@kaihuman/core';
import { localDate } from '@kaihuman/formats';

/**
 * Where a new file goes: one folder and file-name model shared by every create flow (quick
 * capture sheets, the add-tile picker). Pure so the rules are tested once.
 */

/** What to do when the chosen path already exists. */
export type OnExisting =
  /** Captures that append (todo inbox, note dump, log) add to the file. */
  | 'append'
  /** Captures that are one file each (knowledge sources) take the next free `-2`, `-3` name. */
  | 'unique'
  /** Files created on purpose (tiles) must not clobber an existing one. */
  | 'reject';

export interface CreateSpec {
  /** Key for the remembered folder, e.g. `note` or `tile:habit`. */
  id: string;
  /** Enforced extension, including the kind part (`.todos.md`). */
  suffix: string;
  /** Folder used before the user picks one, relative to the repo root. */
  defaultFolder: (appFolder: string) => string;
  /** Prefilled name, without the suffix. `hint` is the capture's first line where it matters. */
  defaultName: (now: Date, hint?: string) => string;
  onExisting: OnExisting;
}

export interface CreateTarget {
  /** Repo-relative folder, no leading or trailing slash; `''` is the repo root. */
  folder: string;
  /** As typed; slugified and given the suffix by `resolveTarget`. */
  name: string;
}

export type ResolvedTarget =
  | { ok: true; path: string; exists: boolean }
  | { ok: false; error: string };

/** `Büro Notes!` → `buro-notes`: lowercase ASCII words joined by `-`, dots and `_` kept. */
export const slugifyName = (input: string): string =>
  input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

const BAD_SEGMENT = /[\\:*?"<>|]/;

/** Trimmed folder without stray slashes, or null when it would escape the repo. */
export function normalizeFolder(input: string): string | null {
  const segments = input
    .trim()
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.some((s) => s === '.' || s === '..' || BAD_SEGMENT.test(s))) return null;
  return segments.join('/');
}

/** The name as it will be saved: suffix typed by the user dropped, slugified, suffix appended. */
export function fileNameFor(name: string, suffix: string): string | null {
  const trimmed = name.trim();
  const bare = trimmed.toLowerCase().endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
  const slug = slugifyName(bare);
  return slug ? `${slug}${suffix}` : null;
}

export const joinPath = (folder: string, file: string): string =>
  folder ? `${folder}/${file}` : file;

/** The full path for `target`, applying the spec's collision rule against `paths`. */
export function resolveTarget(
  spec: CreateSpec,
  target: CreateTarget,
  paths: readonly string[],
): ResolvedTarget {
  const folder = normalizeFolder(target.folder);
  if (folder === null) return { ok: false, error: 'Use a folder inside the repo.' };
  if (/[/\\]/.test(target.name))
    return { ok: false, error: 'Pick the folder above, not in the name.' };
  const file = fileNameFor(target.name, spec.suffix);
  if (!file) return { ok: false, error: 'Give the file a name.' };
  const taken = new Set(paths);
  const path = joinPath(folder, file);
  if (!taken.has(path)) return { ok: true, path, exists: false };
  if (spec.onExisting === 'append') return { ok: true, path, exists: true };
  if (spec.onExisting === 'reject') {
    return { ok: false, error: 'A file with that name already exists.' };
  }
  const base = path.slice(0, -spec.suffix.length);
  for (let n = 2; ; n++) {
    const next = `${base}-${n}${spec.suffix}`;
    if (!taken.has(next)) return { ok: true, path: next, exists: false };
  }
}

/**
 * Folders that hold files, from the repo's file paths: every ancestor, sorted, with the repo root
 * (`''`) first. Hidden folders are left out except the app folder and what is inside it.
 */
export function repoFolders(paths: readonly string[], appFolder: string): string[] {
  const out = new Set<string>(['', appFolder]);
  for (const p of paths) {
    const parts = p.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join('/');
      const hidden = parts.slice(0, i).some((s) => s.startsWith('.'));
      if (!hidden || folder === appFolder || folder.startsWith(`${appFolder}/`)) out.add(folder);
    }
  }
  return [...out].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
}

// ─── Specs ──────────────────────────────────────────────────────────────────

const today = (now: Date) => localDate(now);

/** Quick-capture kinds that write a file the user can place. Ideas live where the idea tools expect them. */
export type CaptureTargetKind = 'todo' | 'note' | 'log' | 'knowledge';

export const CAPTURE_SPECS: Record<CaptureTargetKind, CreateSpec> = {
  todo: {
    id: 'todo',
    suffix: '.todos.md',
    defaultFolder: (app) => app,
    defaultName: () => 'inbox',
    onExisting: 'append',
  },
  note: {
    id: 'note',
    suffix: '.md',
    defaultFolder: (app) => app,
    defaultName: () => 'dump',
    onExisting: 'append',
  },
  log: {
    id: 'log',
    suffix: '.actionlog.md',
    defaultFolder: (app) => app,
    defaultName: () => 'inbox',
    onExisting: 'append',
  },
  knowledge: {
    id: 'knowledge',
    suffix: '.md',
    defaultFolder: (app) => `${app}/raw`,
    defaultName: (now, hint) => `${today(now)}-${slugifyName(hint?.trim() || 'note') || 'note'}`,
    onExisting: 'unique',
  },
};

/** A tile file the add-tile picker creates: today's date as the name, never overwritten. */
export const tileSpec = (kind: string, suffix: string): CreateSpec => ({
  id: `tile:${kind}`,
  suffix,
  defaultFolder: (app) => app,
  defaultName: today,
  onExisting: 'reject',
});

// ─── Remembered folders ─────────────────────────────────────────────────────

/** Last folder used per spec id. */
export type LastFolders = Readonly<Record<string, string>>;

export function parseLastFolders(raw: string | null): LastFolders {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v).filter(
        (e): e is [string, string] => typeof e[1] === 'string' && normalizeFolder(e[1]) !== null,
      ),
    );
  } catch {
    return {};
  }
}

/** The folder a new file starts in: the last one used for this kind, else the kind's default. */
export const initialFolder = (spec: CreateSpec, last: LastFolders, appFolder: string): string =>
  last[spec.id] ?? spec.defaultFolder(appFolder);

const FOLDERS_KEY = 'kh_mobile_create_folders';

export function loadLastFolders(): LastFolders {
  try {
    return parseLastFolders(getCoreStorage().getItem(FOLDERS_KEY));
  } catch {
    return {};
  }
}

export function rememberFolder(id: string, folder: string): void {
  try {
    const next = { ...loadLastFolders(), [id]: folder };
    getCoreStorage().setItem(FOLDERS_KEY, JSON.stringify(next));
  } catch {
    // A preference is not worth failing a save over.
  }
}
