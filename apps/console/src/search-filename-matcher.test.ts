import type { TreeItem } from '@kaihuman/core';
import { describe, expect, it } from 'vitest';
import { matchFilenames } from '../../../packages/ui/src/LifeOS/Organisms/search-filename-matcher';

const blob = (path: string): TreeItem => ({
  path,
  mode: '100644',
  type: 'blob',
  sha: 'sha',
  url: 'url',
});

const dir = (path: string): TreeItem => ({ ...blob(path), type: 'tree' });

describe('matchFilenames', () => {
  it('returns an empty array for an empty query', () => {
    expect(matchFilenames([blob('README.md')], '')).toEqual([]);
    expect(matchFilenames([blob('README.md')], '   ')).toEqual([]);
  });

  it('returns an empty array for an empty tree', () => {
    expect(matchFilenames([], 'readme')).toEqual([]);
  });

  it('matches the basename case-insensitively', () => {
    const tree = [blob('docs/RunBook.md'), blob('src/index.ts')];
    expect(matchFilenames(tree, 'runbook')).toEqual([
      { name: 'RunBook.md', path: 'docs/RunBook.md' },
    ]);
  });

  it('ignores tree (directory) entries, matching only blobs', () => {
    // The directory basename "runbook" matches the query but must be excluded;
    // only the blob is returned.
    const tree = [dir('docs/runbook'), blob('docs/runbook/deploy-runbook.md')];
    expect(matchFilenames(tree, 'runbook')).toEqual([
      { name: 'deploy-runbook.md', path: 'docs/runbook/deploy-runbook.md' },
    ]);
  });

  it('does not match on directory segments, only the basename', () => {
    const tree = [blob('runbook/notes.md')];
    expect(matchFilenames(tree, 'runbook')).toEqual([]);
  });

  it('ranks basename prefix matches above substring matches', () => {
    const tree = [blob('a/my-runbook.md'), blob('b/runbook.md')];
    expect(matchFilenames(tree, 'runbook')).toEqual([
      { name: 'runbook.md', path: 'b/runbook.md' },
      { name: 'my-runbook.md', path: 'a/my-runbook.md' },
    ]);
  });

  it('caps results at the given limit', () => {
    const tree = Array.from({ length: 5 }, (_, i) => blob(`runbook-${i}.md`));
    expect(matchFilenames(tree, 'runbook', 3)).toHaveLength(3);
  });
});
