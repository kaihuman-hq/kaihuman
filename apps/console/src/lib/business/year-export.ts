import { githubService } from '@kaihuman/core';
import {
  BUSINESS_ROOT,
  type BusinessRepo,
  yearExportPaths,
  yearExportSummaries,
} from '@kaihuman/formats/business';
import type { KBRepo } from '../github-kb';
import { todayLocal } from './dates';
import { type ZipEntry, zipStore } from './zip';

/** Parallel reads; enough to hide latency without tripping GitHub's secondary rate limits. */
export const READ_CONCURRENCY = 4;
export const TOO_LARGE = 'The repository is too large to export in one go.';

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (bytes: Uint8Array): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));

/** Paths in the zip drop the `.kh/business/` prefix, so it opens on `invoices/`, `expenses/`… */
const zipPath = (path: string): string => path.slice(BUSINESS_ROOT.length + 1);

/**
 * Builds the Steuerberater zip for `year`. The raw files are read from the head commit; the
 * summaries and the choice of clients and contracts come from `repo`, the state the page loaded.
 * Known limitation: a commit made after the page loaded can make the two differ slightly.
 * A read that fails stops the queue and rejects, so there is never a partial zip.
 */
export async function buildYearExport(
  target: KBRepo,
  repo: BusinessRepo,
  year: string,
  onProgress: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const [owner = '', name = ''] = target.full_name.split('/');
  const head = await githubService.getHeadSha(owner, name, target.default_branch);
  const { tree, truncated } = await githubService.fetchCommitTree(owner, name, head);
  // A partial tree would silently leave files out of a record the Steuerberater relies on.
  if (truncated) throw new Error(TOO_LARGE);
  const blobs = new Map(
    tree.filter((item) => item.type === 'blob').map((item) => [item.path, item.sha]),
  );
  const paths = yearExportPaths(repo, [...blobs.keys()], year);

  const read: Uint8Array[] = new Array(paths.length);
  let next = 0;
  let done = 0;
  let failed = false;
  onProgress(0, paths.length);
  const worker = async () => {
    while (!failed && next < paths.length) {
      const i = next++;
      const path = paths[i] as string;
      try {
        // One request per file: the head tree already names each blob, so no tree walk.
        read[i] = await githubService.getBlobBytes(owner, name, blobs.get(path) ?? '');
      } catch {
        if (failed) return;
        failed = true;
        throw new Error(`Could not read ${path}.`);
      }
      // Another read failed meanwhile: the export has already rejected, so stay silent.
      if (failed) return;
      done++;
      onProgress(done, paths.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, paths.length) }, worker));

  const modified = new Date();
  const enc = new TextEncoder();
  const entries: ZipEntry[] = paths.map((path, i) => ({
    path: zipPath(path),
    bytes: read[i] as Uint8Array,
    modified,
  }));
  for (const [path, text] of Object.entries(yearExportSummaries(repo, year, todayLocal()))) {
    entries.push({ path, bytes: enc.encode(text), modified });
  }
  const sums = await Promise.all(
    entries.map(async (e) => ({ path: e.path, sum: await sha256(e.bytes) })),
  );
  sums.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  entries.push({
    path: 'SHA256SUMS',
    bytes: enc.encode(sums.map((s) => `${s.sum}  ${s.path}\n`).join('')),
    modified,
  });
  return zipStore(entries);
}
