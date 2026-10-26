import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUSINESS_TOOLS_VERSION } from './business-setup';
import { listKBDir, syncKB } from './github-kb';
import { getScaffoldFiles, KB_AGENT_SECTION, KB_SKILL_VERSION } from './kb-skills';

vi.mock('@kaihuman/core', () => ({
  authStore: { token: { value: 'test-token' } },
  githubService: {
    fetchRepoTree: vi.fn(),
    getFileContent: vi.fn(),
    commitFiles: vi.fn(),
  },
}));

import { githubService } from '@kaihuman/core';

const repo = { full_name: 'owner/repo', default_branch: 'main' };

/** A repo holding these files; reading any other path fails like GitHub's 404. */
function givenRepo(files: Record<string, string>) {
  vi.mocked(githubService.fetchRepoTree).mockResolvedValue(
    Object.keys(files).map((path) => ({ path, type: 'blob' })) as never,
  );
  vi.mocked(githubService.getFileContent).mockImplementation(async (_o, _r, path) => {
    if (path in files) return { content: files[path] as string, sha: 'x' };
    throw new Error('Not Found');
  });
}

/** Everything the last sync committed, by path. */
function committed(): Record<string, string> {
  const calls = vi.mocked(githubService.commitFiles).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0]?.[3] as Record<string, string>;
}

const fullySetUp = (): Record<string, string> => ({
  ...getScaffoldFiles(),
  'CLAUDE.md': KB_AGENT_SECTION,
  'AGENTS.md': KB_AGENT_SECTION,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(githubService.commitFiles).mockResolvedValue(undefined);
});

describe('syncKB', () => {
  it('updates the business tools of a repo that has business, in the same commit', async () => {
    givenRepo({
      ...fullySetUp(),
      '.kh/business/business.yaml': 'x',
      '.kh/business/.tools/version': '0.9.0',
    });
    expect(await syncKB(repo)).toBe('updated');
    const written = committed();
    expect(written).toHaveProperty('.kh/business/.tools/version', BUSINESS_TOOLS_VERSION);
    expect(written).toHaveProperty('.github/workflows/business-check.yml');
    expect(written).not.toHaveProperty('.kh/business/business.yaml');
  });

  it('leaves current business tools alone', async () => {
    givenRepo({
      ...fullySetUp(),
      '.kh/business/business.yaml': 'x',
      '.kh/business/.tools/version': BUSINESS_TOOLS_VERSION,
    });
    expect(await syncKB(repo)).toBe('current');
  });

  it('adds no business files to a repo without business', async () => {
    givenRepo(fullySetUp());
    expect(await syncKB(repo)).toBe('current');
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  it('installs nothing into a repo that was never set up', async () => {
    givenRepo({ 'README.md': '# Notes' });
    expect(await syncKB(repo)).toBe('missing');
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  it('sets up every file in one commit on the default branch when asked to', async () => {
    givenRepo({ 'CLAUDE.md': '# Mine\n' });
    expect(await syncKB(repo, { install: true })).toBe('updated');
    const written = committed();
    expect(Object.keys(written)).toEqual(
      expect.arrayContaining([...Object.keys(getScaffoldFiles()), 'CLAUDE.md', 'AGENTS.md']),
    );
    expect(written['.claude/skills/kh-ideas/SKILL.md']).toBeTruthy();
    expect(written['CLAUDE.md']).toBe(`# Mine\n\n${KB_AGENT_SECTION}`);
    expect(written['AGENTS.md']).toBe(KB_AGENT_SECTION);
    expect(vi.mocked(githubService.commitFiles).mock.calls[0]?.[2]).toBe('main');
  });

  it('leaves a current set-up alone', async () => {
    givenRepo(fullySetUp());
    expect(await syncKB(repo)).toBe('current');
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  // Regression: set-up used to write one file per commit, version marker first, so a run that
  // stopped halfway looked finished and CLAUDE.md, AGENTS.md and the Claude skill never came.
  it('completes a set-up that stopped halfway', async () => {
    const files = fullySetUp();
    delete files['.claude/skills/kh-ideas/SKILL.md'];
    delete files['CLAUDE.md'];
    delete files['AGENTS.md'];
    givenRepo(files);
    expect(await syncKB(repo)).toBe('updated');
    expect(Object.keys(committed()).sort()).toEqual(
      ['.claude/skills/kh-ideas/SKILL.md', 'AGENTS.md', 'CLAUDE.md'].sort(),
    );
  });

  it('updates outdated skills but never the user’s notes, log or schema', async () => {
    givenRepo({
      ...fullySetUp(),
      '.kh/.skill-version': '0.0.1',
      '.kh/log.md': 'my log',
      '.kh/schema.md': 'my schema',
      'AGENTS.md': '# Mine\n',
    });
    expect(await syncKB(repo)).toBe('updated');
    const written = committed();
    expect(written['.kh/.skill-version']).toBe(KB_SKILL_VERSION);
    expect(written['.claude/commands/kb-ingest.md']).toBeTruthy();
    expect(written['.agents/skills/kh-ideas/SKILL.md']).toBeTruthy();
    expect(written).not.toHaveProperty('.kh/log.md');
    expect(written).not.toHaveProperty('.kh/schema.md');
    expect(written).not.toHaveProperty('CLAUDE.md');
    expect(written['AGENTS.md']).toBe(`# Mine\n\n${KB_AGENT_SECTION}`);
  });

  it('passes on a failed commit', async () => {
    givenRepo({});
    vi.mocked(githubService.commitFiles).mockRejectedValue(new Error('Conflict'));
    await expect(syncKB(repo, { install: true })).rejects.toThrow('Conflict');
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
