import {
  ALREADY_SAVED,
  addReadLaterItem,
  type ReadLaterDraft,
} from '../components/widgets/read-later-tile.js';
import type { ContentFiles } from './file-editor-screen.js';

/** Same file the console writes: `<app folder>/.readitlater.json`. */
export const readLaterPath = (appFolder: string) => `${appFolder}/.readitlater.json`;

/**
 * Adds a page to the read-later file, creating it when absent. Resolves 'duplicate' when the url
 * is already saved; rejects when the save fails so the caller can undo its optimistic feedback.
 */
export async function saveToReadLater(
  files: Pick<ContentFiles, 'tree' | 'read' | 'write' | 'create'>,
  appFolder: string,
  draft: ReadLaterDraft,
  now: Date,
): Promise<'added' | 'duplicate'> {
  const path = readLaterPath(appFolder);
  const exists = files.tree().some((t) => t.path === path);
  const result = addReadLaterItem(exists ? await files.read(path) : '', draft, now);
  if (!result.ok) {
    if (result.error === ALREADY_SAVED) return 'duplicate';
    throw new Error(result.error);
  }
  if (exists) await files.write(path, result.content);
  else await files.create(path, result.content);
  return 'added';
}
