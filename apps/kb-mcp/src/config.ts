import { parseArgs } from 'node:util';

export interface ServerConfig {
  repoPath: string;
  /** Commit and push each ideas write, and pull before ideas reads and writes. */
  git: boolean;
}

/**
 * Repo path precedence: `--repo <path>`, then `KB_REPO_PATH`, then the working directory.
 * Git sync is on with `--git` or `KB_GIT=1` (or `true`).
 */
export function resolveConfig(argv: string[], env: NodeJS.ProcessEnv, cwd: string): ServerConfig {
  const { values } = parseArgs({
    args: argv,
    options: { repo: { type: 'string' }, git: { type: 'boolean' } },
    strict: true,
    allowPositionals: false,
  });
  return {
    repoPath: values.repo || env.KB_REPO_PATH || cwd,
    git: values.git === true || env.KB_GIT === '1' || env.KB_GIT === 'true',
  };
}
