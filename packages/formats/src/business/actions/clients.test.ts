import { describe, expect, it } from 'vitest';
import { addActionLogEntry, addTodoEntry } from '../../entries.js';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug } from '../ids.js';
import type { Client, Project } from '../records.js';
import { loadBusinessRepo } from '../repo.js';
import {
  addClientLog,
  addClientTodo,
  createClient,
  createProject,
  slugifyName,
} from './clients.js';

const files = loadFixtureRepo();
const repo = loadBusinessRepo(files);
const now = new Date(2026, 10, 2, 9, 5, 7);
const DIR = '.kh/business/clients';

const client: Client = {
  slug: 'neu-gmbh' as Slug,
  name: 'Neu GmbH',
  address: { street: 'Weg 1', postcode: '10115', city: 'Berlin', country: 'DE' },
  contacts: [{ name: 'Max', email: 'max@neu.example' }],
  stage: 'lead',
};
const project: Project = {
  slug: 'relaunch' as Slug,
  client: 'acme-gmbh' as Slug,
  name: 'Relaunch',
  status: 'active',
  rate: { per: 'hour', amount: 9000 },
  retainer: { amount: 50000, interval: 'monthly', next_date: '2026-12-01', description: 'Care' },
};

describe('slugifyName', () => {
  it('uses the ideas rule', () => {
    expect(slugifyName('Müller & Söhne GmbH')).toBe('muller-sohne-gmbh');
  });
  it('has no slug for a name without letters', () => {
    expect(slugifyName('!')).toBeNull();
    expect(slugifyName('')).toBeNull();
  });
});

describe('createClient', () => {
  it('refuses an existing slug', () => {
    expect(createClient(repo, { ...client, slug: 'acme-gmbh' as Slug })).toMatchObject({
      ok: false,
      issues: [{ path: 'slug' }],
    });
  });
  it('refuses an invalid record', () => {
    const r = createClient(repo, { ...client, name: '' });
    expect(r).toMatchObject({ ok: false, issues: [{ path: 'name' }] });
  });
  it('writes YAML that loads with no findings', () => {
    const r = createClient(repo, client);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.message).toBe('business: new client neu-gmbh');
    expect(Object.keys(r.value.changes)).toEqual([`${DIR}/neu-gmbh/client.yaml`]);
    const next = new Map(files);
    for (const [k, v] of Object.entries(r.value.changes)) if (v !== null) next.set(k, v);
    const loaded = loadBusinessRepo(next);
    expect(loaded.clients.find((c) => c.slug === 'neu-gmbh')).toEqual(client);
    expect(loaded.findings).toEqual(repo.findings);
  });
});

describe('createProject', () => {
  it('writes the project file and it loads again', () => {
    const r = createProject(repo, project);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.message).toBe('business: new project relaunch for acme-gmbh');
    const next = new Map(files);
    for (const [k, v] of Object.entries(r.value.changes)) if (v !== null) next.set(k, v);
    expect(Object.keys(r.value.changes)).toEqual([`${DIR}/acme-gmbh/projects/relaunch.yaml`]);
    const loaded = loadBusinessRepo(next);
    expect(loaded.projects.find((p) => p.slug === 'relaunch')).toEqual(project);
    expect(loaded.findings).toEqual(repo.findings);
  });
  it('refuses an existing slug and an unknown client', () => {
    const existing = repo.projects[0];
    if (!existing) throw new Error('fixture has a project');
    expect(createProject(repo, existing)).toMatchObject({ ok: false, issues: [{ path: 'slug' }] });
    expect(createProject(repo, { ...project, client: 'nobody' as Slug })).toMatchObject({
      ok: false,
      issues: [{ path: 'client' }],
    });
  });
  it('refuses an invalid record', () => {
    expect(createProject(repo, { ...project, rate: { per: 'hour', amount: -1 } })).toMatchObject({
      ok: false,
    });
  });
});

describe('addClientTodo / addClientLog', () => {
  const acme = 'acme-gmbh' as Slug;
  // The helpers re-serialise, so "old text" is what they themselves wrote earlier.
  it('keeps the old log byte for byte and adds one line', () => {
    const old = addActionLogEntry('', { description: 'Earlier #x' }, new Date(2026, 9, 1, 8, 0, 0));
    const r = addClientLog(repo, old, acme, 'Called about the offer', now);
    if (!r.ok) throw new Error('expected ok');
    const text = r.value.changes[`${DIR}/acme-gmbh/log.actionlog.md`] ?? '';
    expect(text.startsWith(old)).toBe(true);
    expect(text.slice(old.length).trim().split('\n')).toEqual([
      '- 2026-11-02 09:05:07 Called about the offer',
    ]);
    expect(r.value.message).toBe('business: log for acme-gmbh');
  });
  it('keeps the old todos and adds one', () => {
    const old = addTodoEntry('', { text: 'Earlier todo' }, new Date(2026, 9, 1));
    const r = addClientTodo(repo, old, acme, 'Send invoice #billing', now);
    if (!r.ok) throw new Error('expected ok');
    const text = r.value.changes[`${DIR}/acme-gmbh/todos.todos.md`] ?? '';
    expect(text).toContain('- [ ] Earlier todo');
    expect(text).toContain('- [ ] Send invoice #billing');
    expect(text.split('\n').filter((l) => l.startsWith('- [ ]'))).toHaveLength(2);
  });
  it('creates the files when missing', () => {
    const t = addClientTodo(repo, null, acme, 'First', now);
    const l = addClientLog(repo, null, acme, 'First', now);
    expect(t.ok && l.ok).toBe(true);
    if (l.ok) expect(l.value.changes[`${DIR}/acme-gmbh/log.actionlog.md`]).toContain('First');
  });
  it('refuses an unknown client and empty text', () => {
    expect(addClientTodo(repo, null, 'nobody' as Slug, 'x', now)).toMatchObject({
      ok: false,
      issues: [{ path: 'client' }],
    });
    expect(addClientLog(repo, null, 'acme-gmbh' as Slug, '  ', now)).toMatchObject({
      ok: false,
      issues: [{ path: 'text' }],
    });
    expect(addClientTodo(repo, null, 'acme-gmbh' as Slug, '#only', now)).toMatchObject({
      ok: false,
      issues: [{ path: 'text' }],
    });
  });
});
