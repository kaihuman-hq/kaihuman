/**
 * Braindumps: texts typed in the desktop braindump window, one markdown file each, listed and
 * deleted on the extension's start page (doc/braindump.md). The file name is the creation time in
 * ms and never changes, so editing the first line renames nothing.
 */

export const BRAINDUMP_FOLDER = '.kh/braindumps';

/** Digits only, so an id or path from a page or webview can never name a file outside the folder. */
export type BraindumpId = string & { readonly __brand: 'BraindumpId' };

const BRAINDUMP_PATH = /^\.kh\/braindumps\/(\d{1,20})\.md$/;

export const braindumpPath = (id: BraindumpId) => `${BRAINDUMP_FOLDER}/${id}.md`;

/** The id a braindump's file names, or `null` for any other path — subfolders included. */
export const braindumpIdOf = (path: string): BraindumpId | null =>
  (BRAINDUMP_PATH.exec(path)?.[1] as BraindumpId | undefined) ?? null;

export const braindumpCreatedAt = (id: BraindumpId) => Number(id);

const TITLE_LENGTH = 60;

/** The first non-empty line without its heading marks, shortened to fit a list row. */
export const braindumpTitle = (text: string) => {
  const line =
    text
      .split('\n')
      .map((candidate) => candidate.replace(/^\s*#+\s*/, '').trim())
      .find(Boolean) ?? '';
  if (!line) return '(blank)';
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1)}…` : line;
};
