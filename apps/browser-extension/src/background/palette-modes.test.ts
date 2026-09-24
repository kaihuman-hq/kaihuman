import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deeplEndpoint,
  fetchPromptFiles,
  isGithubWorkFilter,
  isPromptsCacheStale,
  listGithubRepos,
  PROMPTS_CACHE_TTL_MS,
  promptFilePaths,
  searchGithubWork,
  translateWithDeepl,
} from './palette-modes';

const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => String(body),
});

afterEach(() => vi.unstubAllGlobals());

describe('promptFilePaths', () => {
  it('keeps only .prompts.md blobs', () => {
    expect(
      promptFilePaths([
        { path: 'ai/useful.prompts.md', type: 'blob' },
        { path: 'ai/Other.PROMPTS.md', type: 'blob' },
        { path: 'notes.md', type: 'blob' },
        { path: 'dir.prompts.md', type: 'tree' },
      ]),
    ).toEqual(['ai/useful.prompts.md', 'ai/Other.PROMPTS.md']);
  });
});

describe('promptFilePaths for commands', () => {
  it('finds the files ending in the suffix asked for', () => {
    expect(
      promptFilePaths(
        [
          { path: 'ops.commands.md', type: 'blob' },
          { path: 'a.prompts.md', type: 'blob' },
        ],
        '.commands.md',
      ),
    ).toEqual(['ops.commands.md']);
  });
});

describe('fetchPromptFiles', () => {
  it('lists the tree once, then reads each prompts file raw with its path encoded', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/git/trees/')
        ? respond(200, { tree: [{ path: 'a b/x#1.prompts.md', type: 'blob' }] })
        : respond(200, '## Hi'),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchPromptFiles('t', 'o/r')).toEqual([
      { path: 'a b/x#1.prompts.md', content: '## Hi' },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/repos/o/r/git/trees/HEAD?recursive=1',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.github.com/repos/o/r/contents/a%20b/x%231.prompts.md',
    );
  });

  it('finds nothing in an empty repository', async () => {
    vi.stubGlobal('fetch', async () => respond(409, {}));
    expect(await fetchPromptFiles('t', 'o/r')).toEqual([]);
  });
});

describe('isPromptsCacheStale', () => {
  it('is fresh up to the TTL', () => {
    const cache = { repo: 'o/r', files: [], fetchedAt: 1_000 };
    expect(isPromptsCacheStale(cache, 1_000 + PROMPTS_CACHE_TTL_MS)).toBe(false);
    expect(isPromptsCacheStale(cache, 1_001 + PROMPTS_CACHE_TTL_MS)).toBe(true);
  });
});

describe('translateWithDeepl', () => {
  it('sends free keys to the free endpoint, the rest to the paid one', () => {
    expect(deeplEndpoint('abc:fx')).toBe('https://api-free.deepl.com/v2/translate');
    expect(deeplEndpoint('abc')).toBe('https://api.deepl.com/v2/translate');
  });

  it('asks once per target and reports what DeepL detected', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      const { target_lang } = JSON.parse(init.body);
      return respond(200, {
        translations: [{ text: `${target_lang}!`, detected_source_language: 'DE' }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await translateWithDeepl('k:fx', 'Hallo', ['EN-US', 'FR'])).toEqual([
      { target: 'EN-US', text: 'EN-US!', detectedSource: 'DE' },
      { target: 'FR', text: 'FR!', detectedSource: 'DE' },
    ]);
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe('DeepL-Auth-Key k:fx');
  });

  it('turns DeepL statuses into something to act on', async () => {
    vi.stubGlobal('fetch', async () => respond(403, {}));
    await expect(translateWithDeepl('k', 'x', ['DE'])).rejects.toThrow('rejected the API key');
    vi.stubGlobal('fetch', async () => respond(456, {}));
    await expect(translateWithDeepl('k', 'x', ['DE'])).rejects.toThrow('quota');
  });
});

describe('listGithubRepos', () => {
  it('keeps GitHub’s order and drops empty descriptions', async () => {
    vi.stubGlobal('fetch', async () =>
      respond(200, [
        { full_name: 'o/b', description: 'B' },
        { full_name: 'o/a', description: null },
      ]),
    );
    expect(await listGithubRepos('t')).toEqual([
      { fullName: 'o/b', description: 'B' },
      { fullName: 'o/a' },
    ]);
  });
});

describe('searchGithubWork', () => {
  it('runs the filter’s issue search and reads each hit', async () => {
    const fetchMock = vi.fn(async () =>
      respond(200, {
        items: [
          {
            number: 7,
            title: 'Fix the sync',
            html_url: 'https://github.com/o/r/pull/7',
            repository_url: 'https://api.github.com/repos/o/r',
            updated_at: '2026-09-24T08:00:00Z',
            pull_request: {},
          },
          {
            number: 8,
            title: 'Crash on start',
            html_url: 'https://github.com/o/r/issues/8',
            repository_url: 'https://api.github.com/repos/o/r',
            updated_at: '2026-09-23T08:00:00Z',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await searchGithubWork('t', 'review-requested')).toEqual([
      {
        repo: 'o/r',
        number: 7,
        title: 'Fix the sync',
        url: 'https://github.com/o/r/pull/7',
        pullRequest: true,
        updatedAt: '2026-09-24T08:00:00Z',
      },
      {
        repo: 'o/r',
        number: 8,
        title: 'Crash on start',
        url: 'https://github.com/o/r/issues/8',
        pullRequest: false,
        updatedAt: '2026-09-23T08:00:00Z',
      },
    ]);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]));
    expect(url.pathname).toBe('/search/issues');
    expect(url.searchParams.get('q')).toBe('is:open is:pr archived:false review-requested:@me');
    expect(url.searchParams.get('sort')).toBe('updated');
  });

  it('says when GitHub rate limits the search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(403, {})),
    );
    await expect(searchGithubWork('t', 'failing')).rejects.toThrow('rate limited');
  });
});

describe('isGithubWorkFilter', () => {
  it('accepts only the known filters', () => {
    expect(isGithubWorkFilter('assigned')).toBe(true);
    expect(isGithubWorkFilter('toString')).toBe(false);
    expect(isGithubWorkFilter('is:open repo:secret')).toBe(false);
    expect(isGithubWorkFilter(undefined)).toBe(false);
  });
});
