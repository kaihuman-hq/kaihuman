import { beforeEach, describe, expect, it, vi } from 'vitest';
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
let files: Record<string, string>;
let head: number;
const otherDeviceWrites = (path: string, content: string) => {
  files[path] = content;
  head++;
};

beforeEach(() => {
  vi.clearAllMocks();
  files = { [TIME]: entry('phone') };
  head = 1;
  vi.mocked(githubService.getHeadSha).mockImplementation(async () => `head-${head}`);
  vi.mocked(githubService.fetchRepoTree).mockImplementation((async () =>
    Object.entries(files).map(([path, c]) => ({
      path,
      type: 'blob',
      sha: `sha-${path}-${c.length}`,
    }))) as never);
  vi.mocked(githubService.getFileContent).mockImplementation((async (
    _o: string,
    _r: string,
    path: string,
  ) => ({ content: files[path] ?? '', sha: 's' })) as never);
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

describe('writeErrorMessage', () => {
  it('maps conflicts and other errors', () => {
    expect(writeErrorMessage(new ConflictError('x'))).toBe(CONFLICT_MESSAGE);
    expect(writeErrorMessage(new Error('boom'))).toBe('Saving failed, nothing was written: boom');
  });
});
