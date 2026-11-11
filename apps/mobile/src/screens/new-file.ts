import { type CreateSpec, type CreateTarget, resolveTarget } from '../files/create-target.js';
import { NEW_TILE_FILES, tileCreateSpec } from './dashboard-edit.js';

/**
 * Kinds the file browser can create: a plain Markdown note plus every tile file the add-tile
 * picker offers, with the same starters so a file made here opens as the same tile.
 */
export interface NewFileKind {
  /** `note` or a tile kind. */
  id: string;
  spec: CreateSpec;
  starter: string;
}

const NOTE: NewFileKind = {
  id: 'note',
  spec: {
    id: 'file:note',
    suffix: '.md',
    defaultFolder: (app) => app,
    defaultName: () => 'untitled',
    onExisting: 'reject',
  },
  starter: '',
};

export const NEW_FILE_KINDS: readonly NewFileKind[] = [
  NOTE,
  ...NEW_TILE_FILES.flatMap((t) => {
    const spec = tileCreateSpec(t.kind);
    return spec ? [{ id: t.kind, spec, starter: t.starter }] : [];
  }),
];

export type NewFile = { ok: true; path: string; content: string } | { ok: false; error: string };

/** Path and starting text for a new file of `kind` at `target`; never overwrites a file. */
export function newFile(
  kind: NewFileKind,
  target: CreateTarget,
  paths: readonly string[],
): NewFile {
  const resolved = resolveTarget(kind.spec, target, paths);
  return resolved.ok ? { ok: true, path: resolved.path, content: kind.starter } : resolved;
}
