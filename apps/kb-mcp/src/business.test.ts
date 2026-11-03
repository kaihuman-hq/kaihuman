import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BusinessFiles, refusal } from './business.js';
import { KnowledgeBase } from './repo.js';
import { makeBusinessRepo, makeRepo } from './test/fixture.js';

const DRAFT = '.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX28.yaml';

async function open(root: string) {
  return new BusinessFiles(await KnowledgeBase.open(root));
}

describe('BusinessFiles.load', () => {
  it('reads the fixture business repo', async () => {
    const business = await open(await makeBusinessRepo());
    const loaded = await business.load();
    expect(loaded.repo.clients.map((c) => c.slug)).toEqual(['acme-gmbh']);
    expect(loaded.repo.issued.map((i) => i.doc.number).sort()).toEqual([
      'AN-2026-001',
      'RE-2026-0001',
    ]);
    expect(loaded.tree).toContain('.kh/business/business.yaml');
    expect(loaded.symlinks).toEqual([]);
    expect(() => business.requireBusiness(loaded)).not.toThrow();
  });

  it('gives an empty repo when the folder is missing', async () => {
    const business = await open(await makeRepo({}));
    const loaded = await business.load();
    expect(loaded.repo.clients).toEqual([]);
    expect(loaded.tree).toEqual([]);
    expect(() => business.requireBusiness(loaded)).toThrow(/business\.yaml is missing/);
  });

  it('lists symlinks without following them', async () => {
    const root = await makeBusinessRepo();
    const outside = await makeRepo({ 'secret.yaml': 'x: 1\n' });
    await symlink(join(outside, 'secret.yaml'), join(root, '.kh/business/drafts/leak.yaml'));
    const loaded = await (await open(root)).load();
    expect(loaded.symlinks).toEqual(['.kh/business/drafts/leak.yaml']);
    expect(loaded.files.has('.kh/business/drafts/leak.yaml')).toBe(false);
  });

  it('keeps binary files out of the text map', async () => {
    const root = await makeBusinessRepo({
      '.kh/business/invoices/2026/RE-2026-0001.pdf': '%PDF',
    });
    const loaded = await (await open(root)).load();
    expect(loaded.tree).toContain('.kh/business/invoices/2026/RE-2026-0001.pdf');
    expect(loaded.files.has('.kh/business/invoices/2026/RE-2026-0001.pdf')).toBe(false);
  });
});

describe('BusinessFiles.write', () => {
  it('writes a draft and creates folders', async () => {
    const root = await makeRepo({});
    const business = await open(root);
    expect(await business.write({ [DRAFT]: 'id: x\n' })).toEqual([DRAFT]);
    expect(await readFile(join(root, DRAFT), 'utf8')).toBe('id: x\n');
  });

  it.each([
    ['an issued document', '.kh/business/invoices/2026/RE-2026-0002.yaml'],
    ['an issued pdf', '.kh/business/invoices/2026/RE-2026-0001.pdf'],
    ['links.jsonl', '.kh/business/links.jsonl'],
    ['events.jsonl', '.kh/business/events.jsonl'],
    ['payments', '.kh/business/payments/2026.jsonl'],
    ['the timer', '.kh/business/time/running.yaml'],
    ['the profile', '.kh/business/business.yaml'],
    ['a client record', '.kh/business/clients/acme-gmbh/client.yaml'],
    ['a receipt', '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.pdf'],
    ['a path outside the root', '../outside.yaml'],
    ['a path that climbs out', '.kh/business/drafts/../../../x.yaml'],
  ])('refuses %s', async (_name, path) => {
    const root = await makeBusinessRepo();
    const business = await open(root);
    await expect(business.write({ [path]: 'x' })).rejects.toThrow(/Refused to write/);
  });

  it('refuses deletions and bytes', async () => {
    const business = await open(await makeBusinessRepo());
    await expect(business.write({ [DRAFT]: null })).rejects.toThrow(/deleting/);
    await expect(business.write({ [DRAFT]: new Uint8Array([1]) })).rejects.toThrow(/binary/);
  });

  it('writes nothing when any path is refused', async () => {
    const root = await makeRepo({});
    const business = await open(root);
    await expect(
      business.write({ [DRAFT]: 'ok', '.kh/business/links.jsonl': 'x' }),
    ).rejects.toThrow(/links\.jsonl/);
    expect(existsSync(join(root, DRAFT))).toBe(false);
  });

  it('refuses a drafts folder that links outside', async () => {
    const root = await makeBusinessRepo();
    const outside = await makeRepo({});
    await rm(join(root, '.kh/business/drafts'), { recursive: true });
    await symlink(outside, join(root, '.kh/business/drafts'));
    const business = await open(root);
    await expect(business.write({ [DRAFT]: 'x' })).rejects.toThrow(/resolves outside/);
    expect(existsSync(join(outside, '01M5KA3Q00W16BGNTZ49EKRX28.yaml'))).toBe(false);
  });

  it('refuses a business folder that links outside the repository', async () => {
    const root = await makeRepo({});
    const outside = await makeRepo({});
    await mkdir(join(root, '.kh'));
    await symlink(outside, join(root, '.kh/business'));
    const business = await open(root);
    await expect(business.write({ [DRAFT]: 'x' })).rejects.toThrow(/outside the repository/);
  });

  it('refuses an existing file that links outside', async () => {
    const root = await makeBusinessRepo();
    const outside = await makeRepo({ 'o.yaml': 'old' });
    await symlink(join(outside, 'o.yaml'), join(root, DRAFT));
    const business = await open(root);
    await expect(business.write({ [DRAFT]: 'x' })).rejects.toThrow(/resolves outside/);
    expect(await readFile(join(outside, 'o.yaml'), 'utf8')).toBe('old');
  });
});

describe('refusal', () => {
  it('lists path: message pairs', () => {
    expect(
      refusal([
        { path: 'client', message: 'unknown' },
        { path: '', message: 'bad' },
      ]).message,
    ).toBe('client: unknown; bad');
  });
});
