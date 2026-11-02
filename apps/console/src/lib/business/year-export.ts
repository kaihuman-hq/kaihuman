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

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (bytes: Uint8Array): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));

/** Paths in the zip drop the `.kh/business/` prefix, so it opens on `invoices/`, `expenses/`… */
const zipPath = (path: string): string => path.slice(BUSINESS_ROOT.length + 1);

/**
 * Builds the Steuerberater zip for `year` from one commit, so files and summaries agree. A read
 * that fails stops the queue and rejects; nothing is returned, so there is never a partial zip.
 */
export async function buildYearExport(
  target: KBRepo,
  repo: BusinessRepo,
  year: string,
  onProgress: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const [owner = '', name = ''] = target.full_name.split('/');
  const head = await githubService.getHeadSha(owner, name, target.default_branch);
  const tree = await githubService.fetchRepoTree(owner, name, target.default_branch, {
    commitSha: head,
  });
  const paths = yearExportPaths(
    repo,
    tree.filter((item) => item.type === 'blob').map((item) => item.path),
    year,
  );

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
        read[i] = await githubService.getFileBytes(owner, name, path, { ref: head });
      } catch {
        failed = true;
        throw new Error(`Could not read ${path}.`);
      }
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
