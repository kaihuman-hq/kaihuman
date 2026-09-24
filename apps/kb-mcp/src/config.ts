import { parseArgs } from 'node:util';

/** Repo path precedence: `--repo <path>`, then `KB_REPO_PATH`, then the working directory. */
export function resolveRepoPath(argv: string[], env: NodeJS.ProcessEnv, cwd: string): string {
  const { values } = parseArgs({
    args: argv,
    options: { repo: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  return values.repo || env.KB_REPO_PATH || cwd;
}
