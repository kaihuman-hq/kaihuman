import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubService } from './github.service.js';
import { InMemoryGithubService } from './github.service.memory.js';

// Not valid UTF-8 (0xff), so a TextDecoder round-trip would corrupt it.
const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0xff, 0x00];

function wrapBase64(bytes: number[]): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  // GitHub wraps base64 at 60 columns with newlines.
  return `${b64.replace(/(.{4})/g, '$1\n')}\n`;
}

describe('GithubService.getFileBytes', () => {
  const repos = { getContent: vi.fn(), get: vi.fn() };
  const git = { getBlob: vi.fn(), getTree: vi.fn() };
  let svc: GithubService;

  type Entry = { path: string; type: string; sha: string; mode?: string };
  /** Trees by the sha (or ref) they are fetched with. */
  let trees: Record<string, Entry[]>;
  const leaf = (type = 'blob', mode = '100644'): Entry => ({
    path: 'doc.pdf',
    type,
    mode,
    sha: 'blob1',
  });
  const setTrees = (file: Entry = leaf()) => {
    trees = {
      abc123: [
        { path: 'doc.pdf', type: 'blob', mode: '100644', sha: 'rootblob' },
        { path: 'dir', type: 'tree', sha: 't-dir' },
      ],
      main: [{ path: 'doc.pdf', type: 'blob', mode: '100644', sha: 'mainblob' }],
      't-dir': [
        { path: 'sub', type: 'tree', sha: 't-sub' },
        { path: 'a', type: 'tree', sha: 't-a' },
      ],
      't-sub': [{ path: 'other.pdf', type: 'blob', mode: '100644', sha: 'wrong' }, file],
      't-a': [file],
    };
  };

  beforeEach(() => {
    repos.getContent.mockReset();
    repos.get.mockReset();
    git.getBlob.mockReset();
    git.getTree.mockReset();
    setTrees();
    repos.get.mockResolvedValue({ data: { default_branch: 'main' } });
    git.getTree.mockImplementation(async ({ tree_sha }: { tree_sha: string }) => {
      const tree = trees[tree_sha];
      if (!tree) throw Object.assign(new Error('Not Found'), { status: 404 });
      return { data: { sha: tree_sha, tree, truncated: false } };
    });
    git.getBlob.mockResolvedValue({
      data: { content: wrapBase64(PDF_BYTES), encoding: 'base64' },
    });
    svc = new GithubService();
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({
      repos,
      git,
    });
  });

  it('round-trips bytes exactly, walking the git trees down to the parent folder', async () => {
    const bytes = await svc.getFileBytes('o', 'r', 'dir/sub/doc.pdf', { ref: 'abc123' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual(PDF_BYTES);
    expect(git.getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 'blob1' });
    expect(git.getTree.mock.calls.map(([a]) => a)).toEqual([
      { owner: 'o', repo: 'r', tree_sha: 'abc123' },
      { owner: 'o', repo: 'r', tree_sha: 't-dir' },
      { owner: 'o', repo: 'r', tree_sha: 't-sub' },
    ]);
    // Never the contents API: its folder listing stops at 1000 entries, its file reads at 1 MB.
    expect(repos.getContent).not.toHaveBeenCalled();
  });

  it('finds a file in a folder of more than 1000 entries (S12)', async () => {
    const many: Entry[] = Array.from({ length: 1500 }, (_, i) => ({
      path: `f${i}.pdf`,
      type: 'blob',
      mode: '100644',
      sha: `s${i}`,
    }));
    trees['t-a'] = many;
    await svc.getFileBytes('o', 'r', 'dir/a/f1499.pdf', { ref: 'abc123' });
    expect(git.getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 's1499' });
  });

  it('reads a root-level file from the root tree', async () => {
    await svc.getFileBytes('o', 'r', 'doc.pdf', { ref: 'abc123' });
    expect(git.getTree).toHaveBeenCalledTimes(1);
    expect(git.getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 'rootblob' });
  });

  it('starts from the default branch when no ref is given', async () => {
    await svc.getFileBytes('o', 'r', 'doc.pdf');
    expect(repos.get).toHaveBeenCalledWith({ owner: 'o', repo: 'r' });
    expect(git.getTree.mock.calls[0]?.[0].tree_sha).toBe('main');
    expect(git.getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 'mainblob' });
  });

  it('reports a missing entry, folder, ref or blob', async () => {
    const ref = { ref: 'abc123' };
    await expect(svc.getFileBytes('o', 'r', 'gone.pdf', ref)).rejects.toThrow(
      'Not found: gone.pdf',
    );
    await expect(svc.getFileBytes('o', 'r', 'x/doc.pdf', ref)).rejects.toThrow(
      'Not found: x/doc.pdf',
    );
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf', { ref: 'nope' })).rejects.toThrow(
      'Not found: doc.pdf',
    );
    git.getBlob.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf', ref)).rejects.toThrow('Not found: doc.pdf');
  });

  it('rejects a parent that is a file', async () => {
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf/x', { ref: 'abc123' })).rejects.toThrow(
      'Not found: doc.pdf/x',
    );
  });

  it.each([
    ['symlink', leaf('blob', '120000')],
    ['submodule', leaf('commit', '160000')],
    ['dir', leaf('tree', '040000')],
  ])('rejects an entry of type %s', async (type, entry) => {
    setTrees(entry);
    await expect(svc.getFileBytes('o', 'r', 'dir/a/doc.pdf', { ref: 'abc123' })).rejects.toThrow(
      `Path is not a file: ${type}`,
    );
    expect(git.getBlob).not.toHaveBeenCalled();
  });

  it('rejects a non-base64 blob', async () => {
    git.getBlob.mockResolvedValue({ data: { content: 'x', encoding: 'utf-8' } });
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf', { ref: 'abc123' })).rejects.toThrow(
      /encoding/,
    );
  });
});

describe('InMemoryGithubService.getFileBytes', () => {
  it('returns the stored content as bytes', async () => {
    const svc = new InMemoryGithubService();
    await svc.saveFile('o', 'r', 'a.xml', 'häi', 'm');
    expect([...(await svc.getFileBytes('o', 'r', 'a.xml'))]).toEqual([
      ...new TextEncoder().encode('häi'),
    ]);
  });

  it('reports a missing path', async () => {
    const svc = new InMemoryGithubService();
    await expect(svc.getFileBytes('o', 'r', 'nope.pdf')).rejects.toThrow('Not found: nope.pdf');
  });

  it('reads any file of a folder with more than 1000 entries, like the real service (S12)', async () => {
    const svc = new InMemoryGithubService();
    const files: Record<string, string> = {};
    for (let i = 0; i < 1500; i++) files[`docs/f${i}.pdf`] = `pdf ${i}`;
    svc.load(files, []);
    expect(new TextDecoder().decode(await svc.getFileBytes('o', 'r', 'docs/f1499.pdf'))).toBe(
      'pdf 1499',
    );
  });

  it('refuses a folder, like the real service', async () => {
    const svc = new InMemoryGithubService();
    svc.load({ 'docs/a.pdf': 'x' }, []);
    await expect(svc.getFileBytes('o', 'r', 'docs')).rejects.toThrow('Path is not a file: dir');
  });
});

describe('GithubService.getBlobBytes', () => {
  it('reads one blob by sha in one request, binary-safe', async () => {
    const git = {
      getBlob: vi.fn().mockResolvedValue({
        data: { content: wrapBase64(PDF_BYTES), encoding: 'base64' },
      }),
      getTree: vi.fn(),
    };
    const svc = new GithubService();
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({ git });
    expect([...(await svc.getBlobBytes('o', 'r', 'blob1'))]).toEqual(PDF_BYTES);
    expect(git.getBlob).toHaveBeenCalledTimes(1);
    expect(git.getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 'blob1' });
    expect(git.getTree).not.toHaveBeenCalled();
  });

  it('turns a 404 into Not found', async () => {
    const git = {
      getBlob: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 404 })),
    };
    const svc = new GithubService();
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({ git });
    await expect(svc.getBlobBytes('o', 'r', 'nope')).rejects.toThrow('Not found: blob nope');
  });
});

describe('InMemoryGithubService.getBlobBytes', () => {
  it('reads a file by the sha its tree lists', async () => {
    const svc = new InMemoryGithubService();
    await svc.saveFile('o', 'r', 'a/b.txt', 'hello', 'm');
    const item = (await svc.fetchCommitTree('o', 'r', 'head')).tree.find(
      (t) => t.path === 'a/b.txt',
    );
    expect(new TextDecoder().decode(await svc.getBlobBytes('o', 'r', item?.sha ?? ''))).toBe(
      'hello',
    );
    await expect(svc.getBlobBytes('o', 'r', 'nope')).rejects.toThrow('Not found: blob nope');
  });
});
