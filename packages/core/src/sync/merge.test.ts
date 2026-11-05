import { describe, expect, it } from 'vitest';
import { diff3Merge, mergeFile, registerStructuralMerger } from './merge.js';

const lines = (...ls: string[]) => `${ls.join('\n')}\n`;

describe('diff3Merge', () => {
  const base = lines('a', 'b', 'c', 'd', 'e');

  it('merges disjoint edits', () => {
    const local = lines('A', 'b', 'c', 'd', 'e');
    const remote = lines('a', 'b', 'c', 'd', 'E');
    expect(diff3Merge(base, local, remote)).toEqual({
      clean: true,
      content: lines('A', 'b', 'c', 'd', 'E'),
    });
  });

  it('merges an insertion on one side with a deletion elsewhere on the other', () => {
    const local = lines('a', 'b', 'new', 'c', 'd', 'e');
    const remote = lines('a', 'b', 'c', 'e');
    expect(diff3Merge(base, local, remote)).toEqual({
      clean: true,
      content: lines('a', 'b', 'new', 'c', 'e'),
    });
  });

  it('merges the same edit made on both sides', () => {
    const both = lines('a', 'B', 'c', 'd', 'e');
    expect(diff3Merge(base, both, lines('a', 'B', 'c', 'd', 'E'))).toEqual({
      clean: true,
      content: lines('a', 'B', 'c', 'd', 'E'),
    });
  });

  it('conflicts on overlapping different edits', () => {
    expect(
      diff3Merge(base, lines('a', 'X', 'c', 'd', 'e'), lines('a', 'Y', 'c', 'd', 'e')),
    ).toEqual({ clean: false });
  });

  it('conflicts when an edit on one side touches a deletion on the other', () => {
    expect(diff3Merge(base, lines('a', 'b', 'C', 'd', 'e'), lines('a', 'b', 'd', 'e'))).toEqual({
      clean: false,
    });
  });

  // Two different insertions at the same spot have no defined order, so plain diff3 (like git)
  // reports a conflict; list formats avoid this through their structural merge.
  it('conflicts when both sides append different lines at the end', () => {
    expect(diff3Merge(base, lines('a', 'b', 'c', 'd', 'e', 'L'), `${base}R\n`)).toEqual({
      clean: false,
    });
  });

  it('merges identical appends on both sides', () => {
    const both = `${base}Z\n`;
    expect(diff3Merge(base, both, both)).toEqual({ clean: true, content: both });
  });

  it('handles an empty base', () => {
    expect(diff3Merge('', 'hello\n', '')).toEqual({ clean: true, content: 'hello\n' });
    expect(diff3Merge('', 'hello\n', 'hello\n')).toEqual({ clean: true, content: 'hello\n' });
    expect(diff3Merge('', 'hello\n', 'world\n')).toEqual({ clean: false });
  });

  it('reproduces either side when the other is unchanged (random inputs)', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const randomText = () =>
      Array.from({ length: rand(30) }, () => 'abcde'.charAt(rand(5))).join('\n');
    for (let i = 0; i < 200; i++) {
      const b = randomText();
      const x = randomText();
      expect(diff3Merge(b, x, b)).toEqual({ clean: true, content: x });
      expect(diff3Merge(b, b, x)).toEqual({ clean: true, content: x });
    }
  });
});

describe('mergeFile', () => {
  it('takes the trivial cases without diffing', () => {
    expect(mergeFile('n.md', 'b', 'x', 'x')).toEqual({ clean: true, content: 'x' });
    expect(mergeFile('n.md', 'b', 'b', 'r')).toEqual({ clean: true, content: 'r' });
    expect(mergeFile('n.md', 'b', 'l', 'b')).toEqual({ clean: true, content: 'l' });
  });

  it('uses diff3 for other files', () => {
    expect(
      mergeFile('notes/a.md', lines('a', 'b', 'c'), lines('A', 'b', 'c'), lines('a', 'b', 'C')),
    ).toEqual({ clean: true, content: lines('A', 'b', 'C') });
  });
});

describe('registerStructuralMerger', () => {
  it('routes matching paths to the merger, case-insensitively, and falls back to diff3 on null', () => {
    const calls: string[] = [];
    registerStructuralMerger('.Test.list', (_b, l, r) => {
      calls.push('first');
      return { clean: true, content: `${l}+${r}` };
    });
    registerStructuralMerger('.test.list', (_b, l, r) => {
      calls.push('second');
      return l === 'decline' ? null : { clean: true, content: `${l}|${r}` };
    });
    expect(mergeFile('a/B.TEST.LIST', 'b', 'l', 'r')).toEqual({ clean: true, content: 'l|r' });
    expect(mergeFile('x.test.list', 'b', 'decline', 'r')).toEqual({ clean: false });
    expect(mergeFile('x.test.list', 'base\n', 'decline', 'base\n')).toEqual({
      clean: true,
      content: 'decline',
    });
    expect(mergeFile('x.md', 'b', 'l', 'r')).toEqual({ clean: false });
    expect(calls).toEqual(['second', 'second']);
  });

  it('passes a conflict from the merger through without trying diff3', () => {
    registerStructuralMerger('.conflict.list', () => ({ clean: false }));
    const base = 'a\nb\nc\n';
    expect(mergeFile('x.conflict.list', base, 'A\nb\nc\n', 'a\nb\nC\n')).toEqual({
      clean: false,
    });
  });
});
