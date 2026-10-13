import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const PULL_INTERVAL_MS = 60_000;

/** The first non-empty line of what git printed, so a tool result stays short. */
function gitError(error: unknown): string {
  const { stderr, message } = error as { stderr?: string; message?: string };
  const line = `${stderr ?? ''}\n${message ?? ''}`
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return line ?? 'unknown git error';
}

/**
 * Commits and pushes the files the server writes, for clients such as Claude Desktop that cannot
 * run git themselves. Commands run without a shell and never prompt for credentials.
 */
export class GitSync {
  private lastPull = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly repoRoot: string,
    private readonly now: () => number = Date.now,
  ) {}

  private git(args: string[]) {
    return run('git', args, {
      cwd: this.repoRoot,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 60_000,
    });
  }

  /** `git pull --ff-only` at most once a minute. Best effort: a failure leaves the clone as it is. */
  async pull(): Promise<void> {
    const now = this.now();
    if (now - this.lastPull < PULL_INTERVAL_MS) return;
    this.lastPull = now;
    try {
      await this.git(['pull', '--ff-only']);
    } catch (error) {
      // stdout carries the MCP protocol, so diagnostics go to stderr.
      console.error(`kaihuman-kb-mcp: git pull failed: ${gitError(error)}`);
    }
  }

  /**
   * Commits only `paths` (repo-relative), so changes the user has staged stay out of the commit,
   * then pushes. Returns a one-line account of what happened; the files are written either way.
   */
  async commit(paths: string[], message: string): Promise<string> {
    try {
      await this.git(['add', '--', ...paths]);
      await this.git(['commit', '-m', message, '--', ...paths]);
    } catch (error) {
      return `Written but not committed: ${gitError(error)}`;
    }
    try {
      await this.git(['push']);
    } catch (error) {
      return `Committed locally but not pushed: ${gitError(error)}`;
    }
    return 'Committed and pushed.';
  }
}
