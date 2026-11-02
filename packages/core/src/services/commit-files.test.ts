import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gitBlobSha } from '../utils/git-blob-sha.js';
import { ConflictError } from './conflict.js';
import { GithubService } from './github.service.js';
import { InMemoryGithubService } from './github.service.memory.js';

describe('gitBlobSha', () => {
  it('matches git', () => {
    expect(gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    // byte length (2 bytes), not string length; from `git hash-object`
    expect(gitBlobSha('ä')).toBe('9d3f0460de61d6fec8d9ff9a0f06dcc9926e3b7e');
  });
});

describe('gitBlobSha of bytes', () => {
  it('hashes the raw bytes, matching git hash-object', () => {
    // printf '\x00\xff\x01' | git hash-object --stdin
    expect(gitBlobSha(new Uint8Array([0, 255, 1]))).toBe(
      '046f393ee9d8a6a0754b8ddadce727b4ce35f272',
    );
    expect(gitBlobSha(new TextEncoder().encode('ä'))).toBe(gitBlobSha('ä'));
  });
});

describe('InMemoryGithubService.commitFiles', () => {
  it('stores binary files as bytes and returns their git sha', async () => {
    const svc = new InMemoryGithubService();
    const bytes = new Uint8Array([0, 255, 1]);
    const res = await svc.commitFiles('o', 'r', 'main', { 'a/r.png': bytes }, 'm');
    expect(res.blobShas['a/r.png']).toBe(gitBlobSha(bytes));
    expect([...(await svc.getFileBytes('o', 'r', 'a/r.png'))]).toEqual([0, 255, 1]);
    expect((await svc.fetchRepoTree('o', 'r', 'main')).find((t) => t.path === 'a/r.png')?.sha).toBe(
      gitBlobSha(bytes),
    );
  });

  it('deletes null paths, guards on the head and returns blob shas', async () => {
    const svc = new InMemoryGithubService();
    const first = await svc.commitFiles('o', 'r', 'main', { 'a.md': 'x', 'b.md': 'y' }, 'm1');
    expect(Object.keys(first.blobShas).sort()).toEqual(['a.md', 'b.md']);
    expect(first.blobShas['a.md']).toBe(gitBlobSha('x'));
    const head = await svc.getHeadSha('o', 'r', 'main');
    expect(first.commitSha).toBe(head);

    const second = await svc.commitFiles('o', 'r', 'main', { 'b.md': null }, 'm2', {
      expectedHeadSha: head,
    });
    expect(second.blobShas).toEqual({});
    expect(second.commitSha).not.toBe(head);
    expect((await svc.fetchRepoTree('o', 'r', 'main')).map((t) => t.path)).toEqual(['a.md']);

    await expect(
      svc.commitFiles('o', 'r', 'main', { 'a.md': 'z' }, 'm3', { expectedHeadSha: head }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await svc.getFileContent('o', 'r', 'a.md')).content).toBe('x');
  });
});

describe('GithubService.commitFiles', () => {
  const git = {
    getRef: vi.fn(),
    getCommit: vi.fn(),
    createBlob: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    updateRef: vi.fn(),
  };
  let svc: GithubService;

  beforeEach(() => {
    for (const fn of Object.values(git)) fn.mockReset();
    git.getRef.mockResolvedValue({ data: { object: { sha: 'head1' } } });
    git.getCommit.mockResolvedValue({ data: { tree: { sha: 'tree0' } } });
    git.createTree.mockResolvedValue({
      data: {
        sha: 'tree1',
        tree: [
          { path: 'a.md', sha: 'blobA' },
          { path: 'untouched.md', sha: 'blobU' },
        ],
      },
    });
    git.createCommit.mockResolvedValue({ data: { sha: 'commit2' } });
    git.updateRef.mockResolvedValue({});
    svc = new GithubService();
    // Seam: getClient is the single place the Octokit client is built, so replace it.
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({ git });
  });

  it('turns null into a sha:null entry and returns written blob shas', async () => {
    const res = await svc.commitFiles(
      'o',
      'r',
      'main',
      { '.kh/business/a.md': 'x', 'd.md': null },
      'msg',
      { expectedHeadSha: 'head1' },
    );
    expect(git.createTree.mock.calls[0]?.[0].tree).toEqual([
      { path: '.kh/business/a.md', mode: '100644', type: 'blob', content: 'x' },
      { path: 'd.md', mode: '100644', type: 'blob', sha: null },
    ]);
    expect(res).toEqual({
      commitSha: 'commit2',
      blobShas: { '.kh/business/a.md': gitBlobSha('x') },
    });
  });

  it('uploads bytes as a base64 blob and puts it in the tree by sha', async () => {
    git.createBlob.mockResolvedValue({ data: { sha: 'blobPng' } });
    const bytes = new Uint8Array([0, 255, 1]);
    const res = await svc.commitFiles('o', 'r', 'main', { 'a/r.png': bytes, 'n.md': 'x' }, 'msg');
    expect(git.createBlob).toHaveBeenCalledTimes(1);
    expect(git.createBlob).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      content: 'AP8B',
      encoding: 'base64',
    });
    expect(git.createTree.mock.calls[0]?.[0].tree).toEqual([
      { path: 'a/r.png', mode: '100644', type: 'blob', sha: 'blobPng' },
      { path: 'n.md', mode: '100644', type: 'blob', content: 'x' },
    ]);
    expect(res.blobShas['a/r.png']).toBe(gitBlobSha(bytes));
  });

  it('base64-encodes 10 MB without overflowing the stack', async () => {
    git.createBlob.mockResolvedValue({ data: { sha: 'big' } });
    const big = new Uint8Array(10 * 1024 * 1024).fill(7);
    await svc.commitFiles('o', 'r', 'main', { 'big.pdf': big }, 'msg');
    const sent = git.createBlob.mock.calls[0]?.[0].content as string;
    expect(sent.length).toBe(Math.ceil(big.length / 3) * 4);
    expect(atob(sent.slice(0, 8))).toBe('\x07'.repeat(6));
  });

  it('creates no tree when a blob upload fails', async () => {
    git.createBlob.mockRejectedValue(new Error('boom'));
    await expect(
      svc.commitFiles('o', 'r', 'main', { 'a.png': new Uint8Array([1]) }, 'msg'),
    ).rejects.toThrow('boom');
    expect(git.createTree).not.toHaveBeenCalled();
    expect(git.updateRef).not.toHaveBeenCalled();
  });

  it('throws ConflictError before creating anything when the head moved', async () => {
    await expect(
      svc.commitFiles('o', 'r', 'main', { 'a.md': 'x' }, 'msg', { expectedHeadSha: 'old' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(git.createTree).not.toHaveBeenCalled();
    expect(git.createCommit).not.toHaveBeenCalled();
  });

  it.each([409, 422])('maps a %i from updateRef to ConflictError', async (status) => {
    git.updateRef.mockRejectedValue(Object.assign(new Error('not ff'), { status }));
    await expect(svc.commitFiles('o', 'r', 'main', { 'a.md': 'x' }, 'msg')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('rethrows other updateRef errors', async () => {
    git.updateRef.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(
      svc.commitFiles('o', 'r', 'main', { 'a.md': 'x' }, 'msg'),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('reads refs without the HTTP cache', async () => {
    await svc.getHeadSha('o', 'r', 'main');
    await svc.commitFiles('o', 'r', 'main', { 'a.md': 'x' }, 'msg');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    for (const call of git.getRef.mock.calls) {
      await call[0].request.fetch('https://x', {});
    }
    expect(git.getRef).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) expect(call[1]).toMatchObject({ cache: 'no-store' });
    fetchSpy.mockRestore();
  });

  it('fetches the tree and files of a given commit', async () => {
    const getTree = vi.fn().mockResolvedValue({ data: { tree: [] } });
    const getContent = vi
      .fn()
      .mockResolvedValue({ data: { type: 'file', content: btoa('x'), sha: 's' } });
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({
      git: { getRef: git.getRef, getTree },
      repos: { getContent },
    });
    await svc.fetchRepoTree('o', 'r', 'main', { commitSha: 'c1' });
    expect(git.getRef).not.toHaveBeenCalled();
    expect(getTree.mock.calls[0]?.[0]).toMatchObject({ tree_sha: 'c1', recursive: 'true' });
    await svc.getFileContent('o', 'r', 'a.md', { ref: 'c1' });
    expect(getContent.mock.calls[0]?.[0]).toMatchObject({ path: 'a.md', ref: 'c1' });
  });

  it('getHeadSha reads the ref', async () => {
    expect(await svc.getHeadSha('o', 'r', 'main')).toBe('head1');
  });
});
