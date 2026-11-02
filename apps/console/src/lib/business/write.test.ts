import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRepoFilesCacheForTests, loadRepoFiles } from '../repo-files';
import { CONFLICT_MESSAGE, type FileChanges, writeBusiness, writeErrorMessage } from './write';

vi.mock('@kaihuman/core', () => {
  class ConflictError extends Error {}
  return {
    ConflictError,
    githubService: {
      getHeadSha: vi.fn(),
      fetchRepoTree: vi.fn(),
      getFileContent: vi.fn(),
      commitFiles: vi.fn(),
    },
    githubFileStore: { applyCommit: vi.fn() },
  };
});

import { ConflictError, githubFileStore, githubService } from '@kaihuman/core';

const target = { full_name: 'owner/write-test', default_branch: 'main' };
const TIME = '.kh/business/time/2026-11.jsonl';
const entry = (id: string) => `{"id":"${id}"}\n`;

// A tiny remote: file contents by path, a head that changes on every other-device write.
const shaOf = (c: string) => `sha-${c.length}-${c}`;
let files: Record<string, string>;
let head: number;
const otherDeviceWrites = (path: string, content: string) => {
  files[path] = content;
  head++;
};

beforeEach(() => {
  vi.resetAllMocks();
  __resetRepoFilesCacheForTests();
  files = { [TIME]: entry('phone') };
  head = 1;
  vi.mocked(githubService.getHeadSha).mockImplementation(async () => `head-${head}`);
  vi.mocked(githubService.fetchRepoTree).mockImplementation((async () =>
    Object.entries(files).map(([path, c]) => ({
      path,
      type: 'blob',
      sha: shaOf(c),
    }))) as never);
  vi.mocked(githubService.getFileContent).mockImplementation((async (
    _o: string,
    _r: string,
    path: string,
  ) => ({ content: files[path] ?? '', sha: shaOf(files[path] ?? '') })) as never);
});

const appendOurs = (changesOut: FileChanges[] = []) =>
  vi.fn(async (fresh: { read: (p: string) => Promise<string | null> }) => {
    const current = (await fresh.read(TIME)) ?? '';
    const changes = { [TIME]: current + entry('laptop') };
    changesOut.push(changes);
    return { ok: true as const, value: { changes, message: 'business: log time' } };
  });

describe('writeBusiness', () => {
  it('commits with the head it read and updates the local store', async () => {
    vi.mocked(githubService.commitFiles).mockResolvedValue({
      commitSha: 'c1',
      blobShas: { [TIME]: 'new-sha' },
    });
    const result = await writeBusiness(target, appendOurs());
    expect(result).toEqual({ ok: true, value: { commitSha: 'c1' } });
    const call = vi.mocked(githubService.commitFiles).mock.calls[0];
    expect(call?.[4]).toBe('business: log time');
    expect(call?.[5]).toEqual({ expectedHeadSha: 'head-1' });
    expect(githubFileStore.applyCommit).toHaveBeenCalledWith(call?.[3], { [TIME]: 'new-sha' });
  });

  it('retries once on a conflict and keeps both devices entries (two devices at once)', async () => {
    vi.mocked(githubService.commitFiles)
      .mockImplementationOnce(async () => {
        otherDeviceWrites(TIME, entry('phone') + entry('tablet'));
        throw new ConflictError('moved');
      })
      .mockResolvedValueOnce({ commitSha: 'c2', blobShas: {} });
    const build = appendOurs();
    const result = await writeBusiness(target, build);
    expect(result.ok).toBe(true);
    expect(build).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(githubService.commitFiles).mock.calls;
    expect(calls[1]?.[5]).toEqual({ expectedHeadSha: 'head-2' });
    expect((calls[1]?.[3] as FileChanges)[TIME]).toBe(
      entry('phone') + entry('tablet') + entry('laptop'),
    );
  });

  it('throws ConflictError after a second conflict and does not touch the store', async () => {
    vi.mocked(githubService.commitFiles).mockRejectedValue(new ConflictError('moved'));
    await expect(writeBusiness(target, appendOurs())).rejects.toBeInstanceOf(ConflictError);
    expect(githubService.commitFiles).toHaveBeenCalledTimes(2);
    expect(githubFileStore.applyCommit).not.toHaveBeenCalled();
  });

  it('propagates other errors without retrying', async () => {
    vi.mocked(githubService.commitFiles).mockRejectedValue(new Error('boom'));
    await expect(writeBusiness(target, appendOurs())).rejects.toThrow('boom');
    expect(githubService.commitFiles).toHaveBeenCalledTimes(1);
  });

  it('returns builder issues without committing', async () => {
    const issues = [{ path: 'x', message: 'bad' }];
    const result = await writeBusiness(target, async () => ({ ok: false, issues }) as never);
    expect(result).toEqual({ ok: false, issues });
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  it('read returns null for a path outside the tree', async () => {
    vi.mocked(githubService.commitFiles).mockResolvedValue({ commitSha: 'c', blobShas: {} });
    let seen: string | null = 'unset';
    await writeBusiness(target, async (fresh) => {
      seen = await fresh.read('.kh/business/nope.yaml');
      return { ok: true, value: { changes: {}, message: 'business: noop' } };
    });
    expect(seen).toBeNull();
  });
});

describe('writeBusiness reads at the head it commits against', () => {
  it('asks for the tree and files at that head', async () => {
    vi.mocked(githubService.commitFiles).mockResolvedValue({ commitSha: 'c', blobShas: {} });
    await writeBusiness(target, appendOurs());
    expect(vi.mocked(githubService.fetchRepoTree).mock.calls[0]?.[3]).toEqual({
      commitSha: 'head-1',
    });
    for (const call of vi.mocked(githubService.getFileContent).mock.calls) {
      expect(call[3]).toEqual({ ref: 'head-1' });
    }
  });

  it('never commits content older than the tree (stale HTTP cache)', async () => {
    const stale = entry('phone');
    files = { [TIME]: stale + entry('tablet') };
    // The tree lists the new blob, but the content endpoint answers from a stale cache.
    vi.mocked(githubService.getFileContent).mockImplementation((async () => ({
      content: stale,
      sha: shaOf(stale),
    })) as never);
    const build = appendOurs();
    await expect(writeBusiness(target, build)).rejects.toBeInstanceOf(ConflictError);
    expect(build).not.toHaveBeenCalled();
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  it('recovers when the stale answer is gone on the retry', async () => {
    const stale = entry('phone');
    files = { [TIME]: stale + entry('tablet') };
    vi.mocked(githubService.getFileContent)
      .mockImplementationOnce((async () => ({ content: stale, sha: shaOf(stale) })) as never)
      .mockImplementation((async (_o: string, _r: string, path: string) => ({
        content: files[path] ?? '',
        sha: shaOf(files[path] ?? ''),
      })) as never);
    vi.mocked(githubService.commitFiles).mockResolvedValue({ commitSha: 'c', blobShas: {} });
    expect((await writeBusiness(target, appendOurs())).ok).toBe(true);
    const sent = vi.mocked(githubService.commitFiles).mock.calls[0]?.[3] as FileChanges;
    expect(sent[TIME]).toBe(entry('phone') + entry('tablet') + entry('laptop'));
  });

  it('does not cache stale content under the new sha', async () => {
    const stale = entry('phone');
    files = { [TIME]: stale + entry('tablet') };
    const item = { path: TIME, type: 'blob', sha: shaOf(files[TIME] ?? ''), url: '' } as never;
    vi.mocked(githubService.getFileContent).mockResolvedValue({
      content: stale,
      sha: shaOf(stale),
    } as never);
    // A page-style load (no ref) shows what it got, but must not cache it.
    const page = await loadRepoFiles(target.full_name, [item]);
    expect(page.contents[TIME]).toBe(stale);
    vi.mocked(githubService.getFileContent).mockClear();
    await loadRepoFiles(target.full_name, [item]);
    expect(githubService.getFileContent).toHaveBeenCalledTimes(1);
  });

  it('a stale page load does not feed stale content into a write', async () => {
    const stale = entry('phone');
    files = { [TIME]: stale + entry('tablet') };
    const item = { path: TIME, type: 'blob', sha: shaOf(files[TIME] ?? ''), url: '' } as never;
    const fresh = files[TIME] ?? '';
    // The page fetched by path and got the old blob.
    vi.mocked(githubService.getFileContent).mockResolvedValueOnce({
      content: stale,
      sha: shaOf(stale),
    } as never);
    await loadRepoFiles(target.full_name, [item]);
    vi.mocked(githubService.getFileContent).mockImplementation((async (
      _o: string,
      _r: string,
      _p: string,
      opts?: { ref?: string },
    ) => ({ content: fresh, sha: shaOf(fresh), ref: opts?.ref })) as never);
    vi.mocked(githubService.commitFiles).mockResolvedValue({ commitSha: 'c', blobShas: {} });
    await writeBusiness(target, appendOurs());
    expect(githubService.getFileContent).toHaveBeenCalledWith('owner', 'write-test', TIME, {
      ref: 'head-1',
    });
    const sent = vi.mocked(githubService.commitFiles).mock.calls[0]?.[3] as FileChanges;
    expect(sent[TIME]).toBe(fresh + entry('laptop'));
  });
});

describe('writeBusiness with binary changes', () => {
  const PNG = 'expenses/2026/X.png';

  it('commits bytes as they are and never caches them as text', async () => {
    const bytes = new Uint8Array([0, 255, 1]);
    vi.mocked(githubService.commitFiles).mockResolvedValue({
      commitSha: 'c1',
      blobShas: { [PNG]: 'bin-sha', [TIME]: 'time-sha' },
    });
    const result = await writeBusiness(target, async () => ({
      ok: true as const,
      value: { changes: { [PNG]: bytes, [TIME]: entry('x') }, message: 'business: add receipt' },
    }));
    expect(result.ok).toBe(true);
    const sent = vi.mocked(githubService.commitFiles).mock.calls[0]?.[3] as FileChanges;
    expect(sent[PNG]).toBe(bytes);
    expect(githubFileStore.applyCommit).toHaveBeenCalledWith(sent, {
      [PNG]: 'bin-sha',
      [TIME]: 'time-sha',
    });
    // A page load for the new blob must go to GitHub: the write seeded text for TIME only.
    vi.mocked(githubService.getFileContent).mockClear();
    const item = (path: string, sha: string) => ({ path, type: 'blob', sha, url: '' }) as never;
    await loadRepoFiles(target.full_name, [item(PNG, 'bin-sha')]);
    expect(githubService.getFileContent).toHaveBeenCalledTimes(1);
    vi.mocked(githubService.getFileContent).mockClear();
    const text = await loadRepoFiles(target.full_name, [item(TIME, 'time-sha')]);
    expect(githubService.getFileContent).not.toHaveBeenCalled();
    expect(text.contents[TIME]).toBe(entry('x'));
  });
});

describe('writeBusiness after the commit', () => {
  it('still succeeds when the local store update fails', async () => {
    vi.mocked(githubService.commitFiles).mockResolvedValue({ commitSha: 'c1', blobShas: {} });
    vi.mocked(githubFileStore.applyCommit).mockRejectedValue(new Error('idb'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await writeBusiness(target, appendOurs());
    expect(result).toEqual({ ok: true, value: { commitSha: 'c1' } });
    expect(githubService.commitFiles).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('seeds the content cache with the commit blob shas', async () => {
    const written = entry('phone') + entry('laptop');
    vi.mocked(githubService.commitFiles).mockResolvedValue({
      commitSha: 'c1',
      blobShas: { [TIME]: 'new-blob' },
    });
    await writeBusiness(target, appendOurs());
    // Next write: the tree now lists new-blob, so the cached content is used, not refetched.
    files = { [TIME]: written };
    vi.mocked(githubService.fetchRepoTree).mockResolvedValue([
      { path: TIME, type: 'blob', sha: 'new-blob', url: '' },
    ] as never);
    vi.mocked(githubService.getFileContent).mockClear();
    let seen: string | null = null;
    await writeBusiness(target, async (fresh) => {
      seen = await fresh.read(TIME);
      return { ok: true, value: { changes: {}, message: 'business: noop' } };
    });
    expect(seen).toBe(written);
    expect(githubService.getFileContent).not.toHaveBeenCalled();
  });

  it('reports a file fetch error while reading as a saving failure', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValue(new Error('rate limited'));
    const err = await writeBusiness(target, appendOurs()).catch((e) => e);
    expect(writeErrorMessage(err)).toBe(
      `Saving failed, nothing was written: ${TIME}: rate limited`,
    );
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });
});

describe('writeErrorMessage', () => {
  it('maps conflicts and other errors', () => {
    expect(writeErrorMessage(new ConflictError('x'))).toBe(CONFLICT_MESSAGE);
    expect(writeErrorMessage(new Error('boom'))).toBe('Saving failed, nothing was written: boom');
  });
});
