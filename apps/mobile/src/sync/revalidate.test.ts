import { describe, expect, it } from 'vitest';
import { canServeFromCache, shouldFullLoad } from './revalidate.js';

describe('canServeFromCache', () => {
  it('needs an open copy', () => {
    expect(canServeFromCache(undefined, { sha: 'a' }, false)).toBe(false);
    expect(canServeFromCache(undefined, undefined, true)).toBe(false);
  });
  it('serves when the tree sha matches', () => {
    expect(canServeFromCache({ sha: 'a' }, { sha: 'a' }, false)).toBe(true);
  });
  it('refetches when the tree sha differs', () => {
    expect(canServeFromCache({ sha: 'a' }, { sha: 'b' }, false)).toBe(false);
  });
  it('serves dirty copies whatever the tree says', () => {
    expect(canServeFromCache({ sha: 'a' }, { sha: 'b' }, true)).toBe(true);
  });
  it('serves when the tree has no entry or an unknown sha', () => {
    expect(canServeFromCache({ sha: 'a' }, undefined, false)).toBe(true);
    expect(canServeFromCache({ sha: 'a' }, { sha: '' }, false)).toBe(true);
  });
});

describe('shouldFullLoad', () => {
  it('loads when no repo has been loaded or the repo changed', () => {
    expect(shouldFullLoad(null, 'o/r', 3)).toBe(true);
    expect(shouldFullLoad('o/a', 'o/r', 3)).toBe(true);
  });
  it('loads when the tree is empty', () => {
    expect(shouldFullLoad('o/r', 'o/r', 0)).toBe(true);
  });
  it('syncs otherwise', () => {
    expect(shouldFullLoad('o/r', 'o/r', 3)).toBe(false);
  });
  it('loads when there is no current repo (the store decides what to do)', () => {
    expect(shouldFullLoad(null, null, 0)).toBe(true);
  });
});
