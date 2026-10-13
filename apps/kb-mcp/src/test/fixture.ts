import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach } from 'vitest';

const run = promisify(execFile);

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Creates a temp repo containing the given files (paths relative to the repo root). */
export async function makeRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-mcp-'));
  created.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

/** Runs git in `cwd` and returns its trimmed stdout. */
export async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run('git', args, { cwd })).stdout.trim();
}

async function initClone(dir: string) {
  await git(dir, 'config', 'user.name', 'Test');
  await git(dir, 'config', 'user.email', 'test@example.com');
  await git(dir, 'config', 'commit.gpgsign', 'false');
}

/**
 * A temp clone holding `files` in one pushed commit, with a local bare repo as its `origin`.
 * `clone()` makes a second clone of the same remote, standing in for another device.
 */
export async function makeGitRepo(files: Record<string, string>) {
  const base = await makeRepo({});
  const remote = join(base, 'remote.git');
  await run('git', ['init', '--bare', '--initial-branch=main', remote]);
  let clones = 0;
  const clone = async () => {
    const dir = join(base, `clone-${clones++}`);
    await run('git', ['clone', '--quiet', remote, dir]);
    await initClone(dir);
    return dir;
  };
  const root = await clone();
  await git(root, 'checkout', '--quiet', '-B', 'main');
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await git(root, 'add', '--all');
  await git(root, 'commit', '--quiet', '-m', 'initial');
  await git(root, 'push', '--quiet', '-u', 'origin', 'main');
  return { root, remote, clone };
}

export const SAMPLE_IDEAS: Record<string, string> = {
  '.kh/ideas/palette-sync.md': [
    '---',
    'title: "Offline sync for the desktop palette"',
    'status: exploring',
    'product: kaihuman',
    'tags: [palette, sync]',
    'created: 2026-10-01T09:12+02:00',
    'updated: 2026-10-02T18:40+02:00',
    '---',
    '',
    '# Offline sync for the desktop palette',
    '',
    'Queue palette commands while offline.',
    '',
    '## Log',
    '',
    '- 2026-10-02 18:40 · claude · Checked the queue design.',
    '- 2026-10-01 09:12 · human · Created.',
    '',
    '## Challenges',
    '',
    '- [ ] What happens on conflicts?',
    '- [x] Is the queue durable?',
    '',
    '## Braindump',
    '',
    'my raw words',
    '',
  ].join('\n'),
  '.kh/ideas/old-plan.md': [
    '---',
    'title: "An old plan"',
    'status: dropped',
    'product: other',
    'updated: 2026-01-01T10:00+01:00',
    '---',
    '',
    '# An old plan',
    '',
    '## Log',
    '',
    '- 2026-01-01 10:00 · human · Status seed → dropped. Not worth it.',
    '',
  ].join('\n'),
  // Not an idea: the name is not a slug.
  '.kh/ideas/Notes_File.md': '# ignored\n',
};

export const SAMPLE_KB: Record<string, string> = {
  '.kh/wiki/react-hooks.md': [
    '---',
    'title: React Hooks',
    'type: concept',
    'tags: [react, frontend]',
    'sources: [raw/processed/1-hooks.md]',
    'created: 2026-04-01',
    'updated: 2026-04-05',
    '---',
    '',
    '# React Hooks',
    '',
    'Hooks such as useState. Built with [[Vite]].',
  ].join('\n'),
  '.kh/wiki/vite.md': [
    '---',
    'title: Vite',
    'type: entity',
    'tags: [build]',
    'updated: 2026-04-02',
    '---',
    '',
    'Vite is a build tool. See [[react-hooks]].',
  ].join('\n'),
  '.kh/wiki/state.md': [
    '---',
    'title: State Management',
    'type: topic',
    'tags: [react]',
    '---',
    '',
    'Relates to [[React Hooks|hooks]] and [[vite]].',
  ].join('\n'),
  '.kh/index.kb.md': '# Index\n\n- [[React Hooks]]\n- [[Vite]]\n',
  '.kh/log.md': [
    '# Log',
    '',
    '## [2026-04-01] ingest | Hooks article',
    'Created react-hooks.',
    '',
    '## [2026-04-02] ingest | Vite docs',
    'Created vite.',
  ].join('\n'),
};
