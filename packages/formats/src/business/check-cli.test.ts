import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCheck } from './check-cli.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/business/repo');
const dirs: string[] = [];
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const makeRepo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'kh-check-'));
  dirs.push(dir);
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, '.kh'), { recursive: true });
  cpSync(fixture, join(dir, '.kh/business'), { recursive: true });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'first');
  return dir;
};

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  log.mockRestore();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('runCheck', () => {
  it('passes on a clean repo without a base', async () => {
    expect(await runCheck([], makeRepo())).toBe(0);
  });

  it('fails when an issued document changed since the base', async () => {
    const dir = makeRepo();
    const first = git(dir, 'rev-parse', 'HEAD');
    const file = join(dir, '.kh/business/invoices/2026/RE-2026-0001.yaml');
    writeFileSync(file, `${readFileSync(file, 'utf8')}# edited\n`);
    git(dir, 'commit', '-qam', 'edit issued');
    expect(await runCheck(['--base', first], dir)).toBe(1);
    expect(log.mock.calls.flat().join('\n')).toContain(
      '::error file=.kh/business/invoices/2026/RE-2026-0001.yaml',
    );
  });

  it('passes when the base is all zeros or unknown, skipping the frozen-file rule', async () => {
    const dir = makeRepo();
    const file = join(dir, '.kh/business/invoices/2026/RE-2026-0001.yaml');
    writeFileSync(file, `${readFileSync(file, 'utf8')}# edited\n`);
    git(dir, 'commit', '-qam', 'edit issued');
    expect(await runCheck(['--base', '0'.repeat(40)], dir)).toBe(0);
    expect(await runCheck(['--base', 'f'.repeat(40)], dir)).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain('::warning::');
  });

  it('fails on a tree error', async () => {
    const dir = makeRepo();
    rmSync(join(dir, '.kh/business/clients'), { recursive: true });
    expect(await runCheck([], dir)).toBe(1);
  });
});
