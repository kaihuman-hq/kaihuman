import { describe, expect, it } from 'vitest';
import { clientBacklinks } from './backlinks';

describe('clientBacklinks', () => {
  it('finds plain and labelled links outside code, sorted', () => {
    expect(
      clientBacklinks('acme-gmbh', {
        '.kh/wiki/b.md': '[[client:acme-gmbh|Acme]]',
        '.kh/wiki/a.md': 'see [[client:acme-gmbh]]',
        '.kh/ideas/c.md': '[[client:other]]',
        '.kh/wiki/d.md': '```\n[[client:acme-gmbh]]\n```',
        '.kh/wiki/e.md': 'inline `[[client:acme-gmbh]]` example',
        '.kh/wiki/f.md': '[[client:acme-gmbh-2]]',
      }),
    ).toEqual(['.kh/wiki/a.md', '.kh/wiki/b.md']);
  });
});
