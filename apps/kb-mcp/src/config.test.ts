import { describe, expect, it } from 'vitest';
import { resolveRepoPath } from './config.js';

describe('resolveRepoPath', () => {
  it('prefers --repo, then KB_REPO_PATH, then cwd', () => {
    expect(resolveRepoPath(['--repo', '/a'], { KB_REPO_PATH: '/b' }, '/c')).toBe('/a');
    expect(resolveRepoPath(['--repo=/a'], {}, '/c')).toBe('/a');
    expect(resolveRepoPath([], { KB_REPO_PATH: '/b' }, '/c')).toBe('/b');
    expect(resolveRepoPath([], {}, '/c')).toBe('/c');
  });

  it('rejects unknown arguments', () => {
    expect(() => resolveRepoPath(['--nope'], {}, '/c')).toThrow();
  });
});
