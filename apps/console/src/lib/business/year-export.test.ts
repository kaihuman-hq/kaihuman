import { githubService } from '@kaihuman/core';
import { loadBusinessRepo } from '@kaihuman/formats/business';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from './fixture.test-helper';
import { buildYearExport } from './year-export';

vi.mock('@kaihuman/core', () => ({
  githubService: { getHeadSha: vi.fn(), fetchRepoTree: vi.fn(), getFileBytes: vi.fn() },
}));

const R = '.kh/business';
const target = { full_name: 'me/biz', default_branch: 'main' };
const repo = loadBusinessRepo(loadFixtureRepo());
const SIX = [
  `${R}/business.yaml`,
  `${R}/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml`,
  `${R}/invoices/2026/RE-2026-0001.pdf`,
  `${R}/invoices/2026/RE-2026-0001.yaml`,
  `${R}/payments/2026.jsonl`,
  `${R}/time/2026-10.jsonl`,
];
const tree = [
  ...SIX.map((path) => ({ path, type: 'blob', sha: 'x' })),
  { path: `${R}/invoices/2026`, type: 'tree', sha: 'x' },
  { path: `${R}/invoices/2025/RE-2025-0001.pdf`, type: 'blob', sha: 'x' },
  { path: `${R}/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml`, type: 'blob', sha: 'x' },
  { path: `${R}/links.jsonl`, type: 'blob', sha: 'x' },
  { path: `${R}/events.jsonl`, type: 'blob', sha: 'x' },
];
const bytesOf = (path: string) => new TextEncoder().encode(`content of ${path}`);
const sha256 = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');

/** Names and contents of a stored zip, read from its central directory. */
const unzip = (zip: Uint8Array): Map<string, Uint8Array> => {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  let at = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < v.getUint16(eocd + 10, true); i++) {
    const nameLen = v.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    const local = v.getUint32(at + 42, true);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    out.set(name, zip.subarray(start, start + v.getUint32(at + 24, true)));
    at += 46 + nameLen;
  }
  return out;
};

let inFlight = 0;
let maxInFlight = 0;
beforeEach(() => {
  vi.clearAllMocks();
  inFlight = 0;
  maxInFlight = 0;
  vi.mocked(githubService.getHeadSha).mockResolvedValue('head1');
  vi.mocked(githubService.fetchRepoTree).mockResolvedValue(tree as never);
  vi.mocked(githubService.getFileBytes).mockImplementation(async (_o, _r, path) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    return bytesOf(path);
  });
});

describe('buildYearExport', () => {
  it('reads every file at the head commit, four at a time, reporting progress', async () => {
    const progress: [number, number][] = [];
    const zip = await buildYearExport(target, repo, '2026', (d, t) => progress.push([d, t]));

    expect(githubService.fetchRepoTree).toHaveBeenCalledWith('me', 'biz', 'main', {
      commitSha: 'head1',
    });
    const reads = vi.mocked(githubService.getFileBytes).mock.calls;
    expect(reads.map((c) => c[2]).sort()).toEqual(SIX);
    for (const c of reads) expect(c[3]).toEqual({ ref: 'head1' });
    expect(maxInFlight).toBe(4);
    expect(progress[0]).toEqual([0, 6]);
    expect(progress.at(-1)).toEqual([6, 6]);
    expect(progress.map(([d]) => d)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const files = unzip(zip);
    expect(new TextDecoder().decode(files.get('invoices/2026/RE-2026-0001.pdf'))).toBe(
      `content of ${R}/invoices/2026/RE-2026-0001.pdf`,
    );
    expect([...files.keys()]).toContain('summary/vat.csv');
    expect([...files.keys()].some((k) => k.includes('drafts') || k.includes('2025'))).toBe(false);
  });

  it('lists the SHA-256 of every other entry, sorted by path', async () => {
    const files = unzip(await buildYearExport(target, repo, '2026', () => {}));
    const sums = new TextDecoder().decode(files.get('SHA256SUMS'));
    const expected = (
      await Promise.all(
        [...files.entries()]
          .filter(([name]) => name !== 'SHA256SUMS')
          .map(async ([name, bytes]) => `${await sha256(bytes)}  ${name}`),
      )
    ).sort((a, b) => (a.slice(66) < b.slice(66) ? -1 : 1));
    expect(expected).toHaveLength(11);
    expect(sums).toBe(`${expected.join('\n')}\n`);
  });

  it('rejects naming the file it could not read and builds nothing', async () => {
    const failing = `${R}/invoices/2026/RE-2026-0001.pdf`;
    vi.mocked(githubService.getFileBytes).mockImplementation(async (_o, _r, path) => {
      if (path === failing) throw new Error('boom');
      return bytesOf(path);
    });
    await expect(buildYearExport(target, repo, '2026', () => {})).rejects.toThrow(
      `Could not read ${failing}.`,
    );
  });
});
