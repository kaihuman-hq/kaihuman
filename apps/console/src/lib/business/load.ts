import type { TreeItem } from '@kaihuman/core';
import { BUSINESS_ROOT, classifyBusinessPath } from '@kaihuman/formats/business';

export const BUSINESS_PROFILE_PATH = `${BUSINESS_ROOT}/business.yaml`;

/** `repo-files` reports a failed fetch as "path: message". */
export const parseLoadError = (entry: string): { path: string; message: string } => {
  const at = entry.indexOf(': ');
  return at < 0
    ? { path: entry, message: '' }
    : { path: entry.slice(0, at), message: entry.slice(at + 2) };
};

// Artifacts and receipts are known from the tree alone; meta files carry no data.
const SKIPPED_KINDS = new Set(['meta', 'artifact', 'receipt']);

/** The blobs to fetch for business pages. */
export const businessTreeItems = (tree: readonly TreeItem[]): TreeItem[] =>
  tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path.startsWith(`${BUSINESS_ROOT}/`) &&
      !SKIPPED_KINDS.has(classifyBusinessPath(item.path).kind),
  );

/** Markdown that can link to a client, capped so a huge wiki cannot flood the API. */
export const backlinkTreeItems = (tree: readonly TreeItem[], cap = 300): TreeItem[] =>
  tree
    .filter(
      (item) =>
        item.type === 'blob' &&
        item.path.endsWith('.md') &&
        (item.path.startsWith('.kh/wiki/') || item.path.startsWith('.kh/ideas/')),
    )
    .slice(0, cap);
