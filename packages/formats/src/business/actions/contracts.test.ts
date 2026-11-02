import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug, Ulid } from '../ids.js';
import type { Contract } from '../records.js';
import { loadBusinessRepo } from '../repo.js';
import { parseYaml } from '../yaml.js';
import { deleteContract, saveContract } from './contracts.js';

const acme = 'acme-gmbh' as Slug;
const DIR = '.kh/business/clients/acme-gmbh/contracts';
const id = '01M5AMBK0038DJQW16BGNTZ49F' as Ulid;
const contract: Contract = {
  id,
  client: acme,
  kind: 'nda',
  title: 'NDA',
  start: '2026-11-01',
  end: '2027-10-31',
  notice_period_days: 30,
};
const bytes = new Uint8Array([37, 80, 68, 70]);

const repoWith = (stored?: Contract) => {
  const files = loadFixtureRepo();
  // JSON is valid YAML.
  if (stored) files.set(`${DIR}/${stored.id}.yaml`, JSON.stringify(stored));
  return loadBusinessRepo(files);
};
const ok = <T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.issues)}`);
  return r.value;
};

describe('saveContract', () => {
  const repo = repoWith();

  it('refuses a file over 10 MB', () => {
    expect(
      saveContract(repo, { ...contract, file: `${id}.pdf` }, new Uint8Array(10485761)),
    ).toEqual({
      ok: false,
      issues: [{ path: 'file', message: 'Contract files can be up to 10 MB.' }],
    });
  });

  it('refuses a file that is not a PDF', () => {
    expect(saveContract(repo, { ...contract, file: `${id}.docx` }, bytes)).toEqual({
      ok: false,
      issues: [{ path: 'file', message: 'Contract files must be PDF.' }],
    });
  });

  it('writes the YAML and the PDF', () => {
    const v = ok(saveContract(repo, { ...contract, file: `${id}.PDF` }, bytes));
    expect(v.changes[`${DIR}/${id}.pdf`]).toBe(bytes);
    const yaml = v.changes[`${DIR}/${id}.yaml`];
    if (typeof yaml !== 'string') throw new Error('yaml');
    expect(parseYaml(yaml)).toEqual({ ok: true, value: { ...contract, file: `${id}.pdf` } });
    expect(v.message).toBe('business: contract NDA for acme-gmbh');
  });

  it('refuses a file name that is not <id>.pdf, a file without the field, and an unknown client', () => {
    expect(saveContract(repo, { ...contract, file: 'nda.pdf' }, bytes).ok).toBe(false);
    expect(saveContract(repo, contract, bytes).ok).toBe(false);
    expect(saveContract(repo, { ...contract, client: 'nobody' as Slug }).ok).toBe(false);
  });

  it('refuses a file name without its file unless the contract already had it', () => {
    expect(saveContract(repo, { ...contract, file: `${id}.pdf` })).toEqual({
      ok: false,
      issues: [{ path: 'file', message: 'Upload the contract file.' }],
    });
    const stored = { ...contract, file: `${id}.pdf` };
    expect(saveContract(repoWith(stored), { ...stored, title: 'NDA 2' }).ok).toBe(true);
  });

  it('deletes the file when the field is removed', () => {
    const v = ok(saveContract(repoWith({ ...contract, file: `${id}.pdf` }), contract));
    expect(v.changes).toEqual({
      [`${DIR}/${id}.yaml`]: expect.any(String),
      [`${DIR}/${id}.pdf`]: null,
    });
  });
});

describe('deleteContract', () => {
  it('removes the YAML and the file', () => {
    const v = ok(deleteContract(repoWith({ ...contract, file: `${id}.pdf` }), acme, id));
    expect(v.changes).toEqual({ [`${DIR}/${id}.yaml`]: null, [`${DIR}/${id}.pdf`]: null });
    expect(v.message).toBe('business: delete contract NDA for acme-gmbh');
  });

  it('refuses an unknown contract', () => {
    expect(deleteContract(repoWith(), acme, id).ok).toBe(false);
  });
});
