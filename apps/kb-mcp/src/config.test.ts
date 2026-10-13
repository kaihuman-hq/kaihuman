import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig', () => {
  it('prefers --repo, then KB_REPO_PATH, then cwd', () => {
    const repo = (argv: string[], env: NodeJS.ProcessEnv) =>
      resolveConfig(argv, env, '/c').repoPath;
    expect(repo(['--repo', '/a'], { KB_REPO_PATH: '/b' })).toBe('/a');
    expect(repo(['--repo=/a'], {})).toBe('/a');
    expect(repo([], { KB_REPO_PATH: '/b' })).toBe('/b');
    expect(repo([], {})).toBe('/c');
  });

  it('turns git sync on with --git or KB_GIT', () => {
    const git = (argv: string[], env: NodeJS.ProcessEnv) => resolveConfig(argv, env, '/c').git;
    expect(git([], {})).toBe(false);
    expect(git(['--git'], {})).toBe(true);
    expect(git([], { KB_GIT: '1' })).toBe(true);
    expect(git([], { KB_GIT: 'true' })).toBe(true);
    expect(git([], { KB_GIT: '0' })).toBe(false);
  });

  it('rejects unknown arguments', () => {
    expect(() => resolveConfig(['--nope'], {}, '/c')).toThrow();
    expect(() => resolveConfig(['--git=yes'], {}, '/c')).toThrow();
  });
});
