import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMain, runCheck } from './check-cli.js';

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

  it('treats a type change of an issued file (symlink swap) as a modification', async () => {
    const dir = makeRepo();
    const first = git(dir, 'rev-parse', 'HEAD');
    const file = join(dir, '.kh/business/invoices/2026/RE-2026-0001.yaml');
    renameSync(file, join(dir, 'real.yaml'));
    symlinkSync(join(dir, 'real.yaml'), file);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'symlink');
    expect(git(dir, 'diff', '--name-status', first, 'HEAD')).toContain('T\t');
    expect(await runCheck(['--base', first], dir)).toBe(1);
    expect(await runCheck([], dir)).toBe(1);
  });

  it('fails when git itself fails instead of skipping the frozen-file rule', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kh-nogit-'));
    dirs.push(dir);
    cpSync(fixture, join(dir, '.kh/business'), { recursive: true });
    expect(await runCheck(['--base', 'a'.repeat(40)], dir)).toBe(1);
  });
});

describe('isMain', () => {
  it('recognises the entry file through a symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kh-main-'));
    dirs.push(dir);
    const real = join(dir, 'a.mjs');
    writeFileSync(real, '');
    const link = join(dir, 'b.mjs');
    symlinkSync(real, link);
    const url = pathToFileURL(real).href;
    expect(isMain(link, url)).toBe(true);
    expect(isMain(real, url)).toBe(true);
    expect(isMain(join(dir, 'other.mjs'), url)).toBe(false);
    expect(isMain(undefined, url)).toBe(false);
  });
});
