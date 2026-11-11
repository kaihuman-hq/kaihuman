import type { TreeItem } from '@kaihuman/core';
import {
  BUSINESS_ROOT,
  type BusinessRepo,
  classifyBusinessPath,
  loadBusinessRepo,
} from '@kaihuman/formats/business';
import type { ContentFiles } from '../screens/file-editor-screen.js';

export const BUSINESS_PROFILE_PATH = `${BUSINESS_ROOT}/business.yaml`;

// Pdfs, receipts and meta files carry no records; they are known from the tree alone.
const SKIPPED_KINDS = new Set(['meta', 'artifact', 'receipt']);

export const isBusinessEnabled = (tree: readonly TreeItem[]): boolean =>
  tree.some((item) => item.type === 'blob' && item.path === BUSINESS_PROFILE_PATH);

/** The text files under `.kh/business/` that the records are parsed from. */
export const businessRecordPaths = (tree: readonly TreeItem[]): string[] =>
  tree
    .filter(
      (item) =>
        item.type === 'blob' &&
        item.path.startsWith(`${BUSINESS_ROOT}/`) &&
        !SKIPPED_KINDS.has(classifyBusinessPath(item.path).kind),
    )
    .map((item) => item.path);

export type LoadedBusiness = {
  repo: BusinessRepo;
  /** Raw text per record path, so builders can append to the file as it is now. */
  contents: Record<string, string>;
  /** Paths that could not be read (offline and not cached). */
  failed: string[];
};

export type BusinessState = { status: 'disabled' } | ({ status: 'ready' } & LoadedBusiness);

/** Reads every record file from the local cache (the outbox's copy wins) and parses the repo. */
export async function loadBusiness(
  files: Pick<ContentFiles, 'tree' | 'read'>,
): Promise<BusinessState> {
  const tree = files.tree();
  if (!isBusinessEnabled(tree)) return { status: 'disabled' };
  const paths = businessRecordPaths(tree);
  const contents: Record<string, string> = {};
  const failed: string[] = [];
  await Promise.all(
    paths.map(async (path) => {
      try {
        contents[path] = await files.read(path);
      } catch {
        failed.push(path);
      }
    }),
  );
  const blobPaths = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  const repo = loadBusinessRepo(new Map(Object.entries(contents)), blobPaths);
  return { status: 'ready', repo, contents, failed: failed.sort() };
}
