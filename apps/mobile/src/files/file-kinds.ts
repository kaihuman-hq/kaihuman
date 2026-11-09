import { type TileKind, tileKindForPath } from '../components/widgets/tile-controllers.js';

/**
 * How the Files browser shows a file. Widget files reuse their dashboard tile; document kinds
 * get a reader; anything else falls back to the source editor with a "no viewer" note.
 */
export type ViewKind =
  | { type: 'tile'; tile: TileKind }
  | { type: 'markdown' }
  | { type: 'csv' }
  | { type: 'json' }
  | { type: 'yaml' }
  | { type: 'image'; mime: string }
  | { type: 'text' }
  | { type: 'unknown'; ext: string };

export interface FileKindInfo {
  /** The path ends in `.enc`; the view applies to the decrypted content. */
  encrypted: boolean;
  /** The path without a trailing `.enc`; it decides the view. */
  innerPath: string;
  view: ViewKind;
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

const extOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const viewKindForPath = (path: string): ViewKind => {
  const tile = tileKindForPath(path.toLowerCase());
  if (tile) return { type: 'tile', tile };
  const ext = extOf(path);
  if (ext === 'md' || ext === 'markdown') return { type: 'markdown' };
  if (ext === 'csv' || ext === 'tsv') return { type: 'csv' };
  if (ext === 'json') return { type: 'json' };
  if (ext === 'yaml' || ext === 'yml') return { type: 'yaml' };
  const mime = IMAGE_MIME[ext];
  if (mime) return { type: 'image', mime };
  if (ext === 'txt' || ext === 'log' || ext === '') return { type: 'text' };
  return { type: 'unknown', ext };
};

export const fileKindForPath = (path: string): FileKindInfo => {
  const encrypted = path.toLowerCase().endsWith('.enc');
  const innerPath = encrypted ? path.slice(0, -4) : path;
  return { encrypted, innerPath, view: viewKindForPath(innerPath) };
};

/** The raw editor is the default only where no viewer exists. */
export const hasViewer = (view: ViewKind): boolean => view.type !== 'unknown';
