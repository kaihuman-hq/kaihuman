import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import { clientOfPath, inScope, isBusinessPath } from './paths.js';
import { loadBusinessRepo } from './repo.js';

const PDF = '.kh/business/invoices/2026/RE-2026-0001.pdf';
const CLIENT = '.kh/business/clients/acme-gmbh/client.yaml';

describe('loadBusinessRepo', () => {
  it('loads the fixture repo into typed records without findings', () => {
    const files = loadFixtureRepo();
    const repo = loadBusinessRepo(files, [...files.keys(), PDF]);
    expect(repo.profile?.name).toBeTruthy();
    expect(repo.clients.map((c) => c.slug)).toEqual(['acme-gmbh']);
    expect(repo.issued.map((i) => i.doc.number).sort()).toEqual(['AN-2026-001', 'RE-2026-0001']);
    expect(repo.issued.every((i) => i.path.startsWith('.kh/business/'))).toBe(true);
    expect(repo.artifacts.has(PDF)).toBe(true);
    expect(repo.findings).toEqual([]);
  });

  it('lists client notes, todos and log files without parsing them', () => {
    const files = new Map(loadFixtureRepo());
    files.set('.kh/business/clients/acme-gmbh/notes.md', '# notes');
    const repo = loadBusinessRepo(files);
    expect(repo.clientFiles).toContainEqual({
      client: 'acme-gmbh',
      kind: 'notes',
      path: '.kh/business/clients/acme-gmbh/notes.md',
    });
    expect(repo.findings).toEqual([]);
  });

  it('keeps loading the rest when one file is broken', () => {
    const broken = new Map(loadFixtureRepo()).set(CLIENT, 'name: [');
    const repo = loadBusinessRepo(broken);
    expect(repo.clients).toEqual([]);
    expect(repo.issued).toHaveLength(2);
    expect(repo.findings).toContainEqual(expect.objectContaining({ file: CLIENT, level: 'error' }));
  });

  it('reports a missing profile only when it is not in the tree', () => {
    const without = new Map(loadFixtureRepo());
    without.delete('.kh/business/business.yaml');
    const missing = (treePaths?: string[]) =>
      loadBusinessRepo(without, treePaths).findings.some((f) => f.message.includes('is missing'));
    expect(missing([])).toBe(true);
    expect(missing()).toBe(true);
    // In the tree but not fetched: a load failure the caller already lists.
    expect(missing(['.kh/business/business.yaml'])).toBe(false);
  });

  it('warns about unrecognised paths, also from the tree', () => {
    const repo = loadBusinessRepo(loadFixtureRepo(), ['.kh/business/stray.txt']);
    expect(repo.findings).toContainEqual(
      expect.objectContaining({ file: '.kh/business/stray.txt', level: 'warning' }),
    );
  });
});

describe('path scope helpers', () => {
  it('finds the client of a path', () => {
    expect(clientOfPath('.kh/business/clients/acme-gmbh/todos.todos.md')).toBe('acme-gmbh');
    expect(clientOfPath('todos/work.todos.md')).toBeNull();
    expect(clientOfPath('.kh/business/invoices/2026/x.yaml')).toBeNull();
  });

  it('scopes paths to business or personal', () => {
    const log = '.kh/business/clients/acme-gmbh/log.actionlog.md';
    expect(isBusinessPath(log)).toBe(true);
    expect(isBusinessPath('todos/work.todos.md')).toBe(false);
    expect(inScope('todos/work.todos.md', 'personal')).toBe(true);
    expect(inScope(log, 'personal')).toBe(false);
    expect(inScope(log, 'business')).toBe(true);
    expect(inScope('todos/work.todos.md', 'business')).toBe(false);
    expect(inScope(log, 'all')).toBe(true);
    expect(inScope('todos/work.todos.md', 'all')).toBe(true);
  });
});
