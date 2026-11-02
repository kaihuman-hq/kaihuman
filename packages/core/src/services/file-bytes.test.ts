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
  const repos = { getContent: vi.fn() };
  const git = { getBlob: vi.fn() };
  let svc: GithubService;

  const listing = (type = 'file') => ({
    data: [
      { name: 'other.pdf', type: 'file', sha: 'wrong' },
      { name: 'doc.pdf', type, sha: 'blob1' },
    ],
  });

  beforeEach(() => {
    repos.getContent.mockReset();
    git.getBlob.mockReset();
    repos.getContent.mockResolvedValue(listing());
    git.getBlob.mockResolvedValue({
      data: { content: wrapBase64(PDF_BYTES), encoding: 'base64' },
    });
    svc = new GithubService();
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({
      repos,
      git,
    });
  });

  it('round-trips bytes exactly, picking the sha from the parent listing', async () => {
    const bytes = await svc.getFileBytes('o', 'r', 'dir/sub/doc.pdf');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual(PDF_BYTES);
    expect(git.getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 'blob1' });
    // Never the file itself: the contents API refuses files over 1 MB.
    expect(repos.getContent).toHaveBeenCalledTimes(1);
    expect(repos.getContent.mock.calls[0]?.[0].path).toBe('dir/sub');
  });

  it('lists the repo root for a root-level file', async () => {
    await svc.getFileBytes('o', 'r', 'doc.pdf');
    expect(repos.getContent.mock.calls[0]?.[0].path).toBe('');
  });

  it('passes the ref through to the lookup', async () => {
    await svc.getFileBytes('o', 'r', 'a/doc.pdf', { ref: 'abc123' });
    expect(repos.getContent).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      path: 'a',
      ref: 'abc123',
    });
  });

  it('omits ref when none is given', async () => {
    await svc.getFileBytes('o', 'r', 'doc.pdf');
    expect(repos.getContent.mock.calls[0]?.[0]).not.toHaveProperty('ref');
  });

  it('reports a missing entry, parent or blob', async () => {
    await expect(svc.getFileBytes('o', 'r', 'gone.pdf')).rejects.toThrow('Not found: gone.pdf');
    repos.getContent.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(svc.getFileBytes('o', 'r', 'x/doc.pdf')).rejects.toThrow('Not found: x/doc.pdf');
    repos.getContent.mockResolvedValue(listing());
    git.getBlob.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf')).rejects.toThrow('Not found: doc.pdf');
  });

  it('rejects a parent that is a file', async () => {
    repos.getContent.mockResolvedValue({ data: { type: 'file', sha: 's' } });
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf/x')).rejects.toThrow('Not found');
  });

  it.each(['symlink', 'submodule', 'dir'])('rejects an entry of type %s', async (type) => {
    repos.getContent.mockResolvedValue(listing(type));
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf')).rejects.toThrow(
      `Path is not a file: ${type}`,
    );
    expect(git.getBlob).not.toHaveBeenCalled();
  });

  it('rejects a non-base64 blob', async () => {
    git.getBlob.mockResolvedValue({ data: { content: 'x', encoding: 'utf-8' } });
    await expect(svc.getFileBytes('o', 'r', 'doc.pdf')).rejects.toThrow(/encoding/);
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
});
