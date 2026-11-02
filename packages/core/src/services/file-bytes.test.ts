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

  beforeEach(() => {
    repos.getContent.mockReset();
    git.getBlob.mockReset();
    repos.getContent.mockResolvedValue({ data: { type: 'file', sha: 'blob1', content: '' } });
    git.getBlob.mockResolvedValue({
      data: { content: wrapBase64(PDF_BYTES), encoding: 'base64' },
    });
    svc = new GithubService();
    vi.spyOn(svc as unknown as { getClient: () => unknown }, 'getClient').mockReturnValue({
      repos,
      git,
    });
  });

  it('round-trips bytes exactly, including invalid UTF-8', async () => {
    const bytes = await svc.getFileBytes('o', 'r', 'doc.pdf');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual(PDF_BYTES);
    expect(git.getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 'blob1' });
  });

  it('passes the ref through to the lookup', async () => {
    await svc.getFileBytes('o', 'r', 'doc.pdf', { ref: 'abc123' });
    expect(repos.getContent).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      path: 'doc.pdf',
      ref: 'abc123',
    });
  });

  it('omits ref when none is given', async () => {
    await svc.getFileBytes('o', 'r', 'doc.pdf');
    expect(repos.getContent.mock.calls[0]?.[0]).not.toHaveProperty('ref');
  });

  it('reports a missing path', async () => {
    repos.getContent.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(svc.getFileBytes('o', 'r', 'gone.pdf')).rejects.toThrow('Not found: gone.pdf');
    expect(git.getBlob).not.toHaveBeenCalled();
  });

  it('rejects a directory', async () => {
    repos.getContent.mockResolvedValue({ data: [] });
    await expect(svc.getFileBytes('o', 'r', 'dir')).rejects.toThrow(/directory/);
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
