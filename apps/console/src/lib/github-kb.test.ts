import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getInstalledSkillVersion,
  isKBInitialized,
  listKBDir,
  updateSkillsIfNeeded,
} from './github-kb';
import { KB_SKILL_VERSION } from './kb-skills';

vi.mock('@lifosy/core', () => ({
  authStore: { token: { value: 'test-token' } },
  githubService: {
    getFileContent: vi.fn(),
    upsertRepoFile: vi.fn(),
  },
}));

import { githubService } from '@lifosy/core';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getInstalledSkillVersion', () => {
  it('returns null when the version file does not exist', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValue(new Error('Not Found'));
    expect(await getInstalledSkillVersion('owner/repo')).toBeNull();
  });

  it('returns trimmed version string when file exists', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({ content: '1.0.0\n', sha: 'abc' });
    const result = await getInstalledSkillVersion('owner/repo');
    expect(result).toBe('1.0.0');
    expect(githubService.getFileContent).toHaveBeenCalledWith(
      'owner',
      'repo',
      '.kh/.skill-version',
    );
  });
});

describe('isKBInitialized', () => {
  it('returns false when version file is missing', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValue(new Error('Not Found'));
    expect(await isKBInitialized('owner/repo')).toBe(false);
  });

  it('returns true when version file exists', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({ content: '1.0.0', sha: 'abc' });
    expect(await isKBInitialized('owner/repo')).toBe(true);
  });
});

describe('updateSkillsIfNeeded', () => {
  it('returns false and writes nothing when installed version matches', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({
      content: KB_SKILL_VERSION,
      sha: 'abc',
    });
    const updated = await updateSkillsIfNeeded('owner/repo');
    expect(updated).toBe(false);
    expect(githubService.upsertRepoFile).not.toHaveBeenCalled();
  });

  it('writes skill files and returns true when version is outdated', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({
      content: '0.0.1',
      sha: 'abc',
    });
    vi.mocked(githubService.upsertRepoFile).mockResolvedValue({} as any);
    const updated = await updateSkillsIfNeeded('owner/repo');
    expect(updated).toBe(true);
    const writtenPaths = vi.mocked(githubService.upsertRepoFile).mock.calls.map((c) => c[2]);
    expect(writtenPaths).toContain('.kh/.skill-version');
    expect(writtenPaths).toContain('.claude/commands/kb-ingest.md');
    expect(writtenPaths).toContain('.claude/commands/kb-lint.md');
    expect(writtenPaths).toContain('.claude/commands/kb-ask.md');
  });

  it('writes skill files and returns true when KB is not yet initialized', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValue(new Error('Not Found'));
    vi.mocked(githubService.upsertRepoFile).mockResolvedValue({} as any);
    const updated = await updateSkillsIfNeeded('owner/repo');
    expect(updated).toBe(true);
  });
});

describe('listKBDir', () => {
  it('returns empty array on fetch error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );
    expect(await listKBDir('owner/repo', 'raw')).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('filters out .gitkeep and non-md files', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { type: 'file', name: 'article.md', path: '.kh/raw/article.md', sha: 'abc' },
            { type: 'file', name: '.gitkeep', path: '.kh/raw/.gitkeep', sha: 'def' },
            { type: 'file', name: 'notes.txt', path: '.kh/raw/notes.txt', sha: 'ghi' },
          ]),
      }),
    );
    const result = await listKBDir('owner/repo', 'raw');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'article.md', path: '.kh/raw/article.md', sha: 'abc' });
    vi.unstubAllGlobals();
  });

  it('uses Authorization header with stored token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
    });
    vi.stubGlobal('fetch', fetchMock);
    await listKBDir('owner/repo', 'wiki');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/contents/.kh/wiki',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
