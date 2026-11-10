import { describe, expect, it } from 'vitest';
import { pickWarmPaths } from './warm.js';

const f = (path: string, type = 'blob') => ({ path, sha: 's', type });

describe('pickWarmPaths', () => {
  it('picks uncached text files only', () => {
    const tree = [
      f('a.md'),
      f('b.md'),
      f('dir', 'tree'),
      f('pic.png'),
      f('x.bookmarks.json'),
      f('secret.md.enc'),
      f('c.json'),
    ];
    expect(pickWarmPaths(tree, (p) => p === 'b.md', 10)).toEqual(['a.md', 'x.bookmarks.json']);
  });

  it('respects the limit', () => {
    expect(pickWarmPaths([f('a.md'), f('b.md'), f('c.md')], () => false, 2)).toEqual([
      'a.md',
      'b.md',
    ]);
  });
});
