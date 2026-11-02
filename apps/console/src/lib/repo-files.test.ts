import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kaihuman/core', () => ({ githubService: { getFileContent: vi.fn() } }));

import { githubService, type TreeItem } from '@kaihuman/core';
import { backlinkTreeItems, businessTreeItems } from './business/load';
import { __resetRepoFilesCacheForTests, loadRepoFiles } from './repo-files';

const blob = (path: string, sha: string): TreeItem =>
  ({ path, sha, type: 'blob', mode: '100644', url: '' }) as TreeItem;

const tree = [
  blob('.kh/business/business.yaml', 's1'),
  blob('.kh/business/clients/acme-gmbh/client.yaml', 's2'),
  blob('.kh/business/invoices/2026/RE-2026-0001.pdf', 's3'),
  blob('.kh/business/.tools/business-check.mjs', 's4'),
  blob('notes/a.md', 's5'),
  { ...blob('.kh/business/clients', 's6'), type: 'tree' },
];

// What GitHub reports for a path: the listed blob, as a fresh read does.
let served: Record<string, string>;

beforeEach(() => {
  __resetRepoFilesCacheForTests();
  served = Object.fromEntries(tree.map((t) => [t.path, t.sha]));
  vi.mocked(githubService.getFileContent).mockReset();
  vi.mocked(githubService.getFileContent).mockImplementation((async (
    _o: string,
    _r: string,
    path: string,
  ) => ({ content: 'x', sha: served[path] })) as never);
});

describe('tree selection', () => {
  it('takes only business data blobs, not meta, artifacts or directories', () => {
    expect(businessTreeItems(tree).map((t) => t.path)).toEqual([
      '.kh/business/business.yaml',
      '.kh/business/clients/acme-gmbh/client.yaml',
    ]);
  });

  it('takes wiki and ideas Markdown, capped', () => {
    const md = [blob('.kh/wiki/a.md', 'x'), blob('.kh/ideas/b.md', 'y'), blob('docs/c.md', 'z')];
    expect(backlinkTreeItems(md).map((t) => t.path)).toEqual(['.kh/wiki/a.md', '.kh/ideas/b.md']);
    expect(backlinkTreeItems(md, 1)).toHaveLength(1);
  });
});

describe('loadRepoFiles', () => {
  it('serves a second load with unchanged shas from the cache', async () => {
    await loadRepoFiles('o/r', businessTreeItems(tree));
    await loadRepoFiles('o/r', businessTreeItems(tree));
    expect(githubService.getFileContent).toHaveBeenCalledTimes(2);
  });

  it('refetches a file whose sha changed', async () => {
    served['a.md'] = '1';
    await loadRepoFiles('o/c', [blob('a.md', '1')]);
    served['a.md'] = '2';
    await loadRepoFiles('o/c', [blob('a.md', '2')]);
    expect(githubService.getFileContent).toHaveBeenCalledTimes(2);
  });

  it('returns content for a stale read but does not cache it', async () => {
    served['a.md'] = 'old';
    const r = await loadRepoFiles('o/s', [blob('a.md', 'new')]);
    expect(r.contents['a.md']).toBe('x');
    await loadRepoFiles('o/s', [blob('a.md', 'new')]);
    expect(githubService.getFileContent).toHaveBeenCalledTimes(2);
  });

  it('reports failures as "path: message" and keeps the other files', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValueOnce(new Error('boom'));
    const r = await loadRepoFiles('o/r2', businessTreeItems(tree), 1);
    expect(r.errors).toEqual(['.kh/business/business.yaml: boom']);
    expect(Object.keys(r.contents)).toEqual(['.kh/business/clients/acme-gmbh/client.yaml']);
  });
});
