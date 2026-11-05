import type { TreeItem } from '@kaihuman/core';
import { BUSINESS_ROOT, classifyBusinessPath } from '@kaihuman/formats/business';

export const BUSINESS_PROFILE_PATH = `${BUSINESS_ROOT}/business.yaml`;
export const BUSINESS_TOOLS_VERSION_PATH = `${BUSINESS_ROOT}/.tools/version`;

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

const CLIENT_DIR = new RegExp(`^${BUSINESS_ROOT.replace('.', '\\.')}/clients/([^/]+)/`);

/** Client slugs from the folder names alone, for the palette; no file is loaded. */
export const businessClientSlugs = (tree: readonly TreeItem[]): string[] =>
  [
    ...new Set(
      tree.flatMap((item) => {
        const slug = CLIENT_DIR.exec(item.path)?.[1];
        return slug ? [slug] : [];
      }),
    ),
  ].sort();
