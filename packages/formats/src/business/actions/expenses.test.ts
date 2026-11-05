import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug, Ulid } from '../ids.js';
import type { Expense } from '../records.js';
import { loadBusinessRepo } from '../repo.js';
import { parseYaml } from '../yaml.js';
import { deleteExpense, saveExpense } from './expenses.js';

const DIR = '.kh/business/expenses';
const id = '01M5AMBK0038DJQW16BGNTZ49F' as Ulid;
const expense: Expense = {
  id,
  date: '2026-10-20',
  supplier: 'Bahn',
  description: 'Ticket',
  category: 'travel',
  net: 9346,
  vat: 654,
  gross: 10000,
  vat_rate: '7',
  client: 'acme-gmbh' as Slug,
};
const bytes = new Uint8Array([1, 2, 3]);

const repoWith = (stored?: Expense, tree: string[] = []) => {
  const files = loadFixtureRepo();
  // JSON is valid YAML.
  if (stored)
    files.set(`${DIR}/${stored.date.slice(0, 4)}/${stored.id}.yaml`, JSON.stringify(stored));
  return loadBusinessRepo(files, tree);
};
const ok = <T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.issues)}`);
  return r.value;
};

describe('saveExpense', () => {
  const repo = repoWith();

  it('refuses a receipt over 10 MB before anything else', () => {
    const r = saveExpense(
      repo,
      { ...expense, receipt: `${id}.pdf` },
      { ext: 'pdf', bytes: new Uint8Array(10485761) },
    );
    expect(r).toEqual({
      ok: false,
      issues: [{ path: 'receipt', message: 'Receipts can be up to 10 MB.' }],
    });
  });

  it('accepts a receipt of exactly 10 MB', () => {
    const r = saveExpense(
      repo,
      { ...expense, receipt: `${id}.pdf` },
      { ext: 'pdf', bytes: new Uint8Array(10485760) },
    );
    expect(r.ok).toBe(true);
  });

  it('refuses a receipt of another type', () => {
    const r = saveExpense(repo, { ...expense, receipt: `${id}.exe` }, { ext: 'exe', bytes });
    expect(r).toEqual({
      ok: false,
      issues: [{ path: 'receipt', message: 'Receipts must be PDF, JPG, PNG, WEBP or HEIC.' }],
    });
  });

  it('refuses a receipt name that is not <id>.<ext>', () => {
    const r = saveExpense(repo, { ...expense, receipt: 'scan.pdf' }, { ext: 'pdf', bytes });
    expect(r.ok).toBe(false);
  });

  it('writes the YAML and the receipt bytes, extension lower-cased', () => {
    const v = ok(saveExpense(repo, { ...expense, receipt: `${id}.PNG` }, { ext: 'PNG', bytes }));
    expect(Object.keys(v.changes).sort()).toEqual([
      `${DIR}/2026/${id}.png`,
      `${DIR}/2026/${id}.yaml`,
    ]);
    expect(v.changes[`${DIR}/2026/${id}.png`]).toBe(bytes);
    const yaml = v.changes[`${DIR}/2026/${id}.yaml`];
    if (typeof yaml !== 'string') throw new Error('yaml');
    expect(parseYaml(yaml)).toEqual({ ok: true, value: { ...expense, receipt: `${id}.png` } });
    expect(yaml.startsWith(`id: ${id}\ndate:`)).toBe(true);
    expect(v.message).toBe('business: expense Bahn 2026-10-20');
  });

  it('writes the YAML alone without a receipt', () => {
    const v = ok(saveExpense(repo, expense));
    expect(Object.keys(v.changes)).toEqual([`${DIR}/2026/${id}.yaml`]);
  });

  it('refuses a receipt name without its file unless the expense already had it', () => {
    expect(saveExpense(repo, { ...expense, receipt: `${id}.pdf` })).toEqual({
      ok: false,
      issues: [{ path: 'receipt', message: 'Upload the receipt file.' }],
    });
    const stored = { ...expense, receipt: `${id}.png` };
    expect(saveExpense(repoWith(stored), { ...stored, receipt: `${id}.pdf` })).toEqual({
      ok: false,
      issues: [{ path: 'receipt', message: 'Upload the receipt file.' }],
    });
  });

  it('refuses a receipt file without the receipt field', () => {
    expect(saveExpense(repo, expense, { ext: 'pdf', bytes }).ok).toBe(false);
  });

  it('refuses an invalid expense', () => {
    expect(saveExpense(repo, { ...expense, gross: 1 }).ok).toBe(false);
  });

  it('refuses an unknown client', () => {
    expect(saveExpense(repo, { ...expense, client: 'nobody' as Slug }).ok).toBe(false);
  });

  it('deletes the old receipt when the extension changes', () => {
    const stored = { ...expense, receipt: `${id}.png` };
    const r = repoWith(stored, [`${DIR}/2026/${id}.png`]);
    const v = ok(saveExpense(r, { ...expense, receipt: `${id}.pdf` }, { ext: 'pdf', bytes }));
    expect(v.changes[`${DIR}/2026/${id}.png`]).toBeNull();
    expect(v.changes[`${DIR}/2026/${id}.pdf`]).toBe(bytes);
  });

  it('keeps the receipt when only the YAML changes', () => {
    const stored = { ...expense, receipt: `${id}.png` };
    const r = repoWith(stored, [`${DIR}/2026/${id}.png`]);
    const v = ok(saveExpense(r, { ...stored, description: 'Ticket Berlin' }));
    expect(Object.keys(v.changes)).toEqual([`${DIR}/2026/${id}.yaml`]);
  });

  it('deletes the receipt when the field is removed', () => {
    const stored = { ...expense, receipt: `${id}.png` };
    const v = ok(saveExpense(repoWith(stored), expense));
    expect(v.changes[`${DIR}/2026/${id}.png`]).toBeNull();
  });

  it('moves the YAML when the year changes and refuses to strand a receipt', () => {
    const v = ok(saveExpense(repoWith(expense), { ...expense, date: '2027-01-02' }));
    expect(v.changes[`${DIR}/2026/${id}.yaml`]).toBeNull();
    expect(typeof v.changes[`${DIR}/2027/${id}.yaml`]).toBe('string');
    const stored = { ...expense, receipt: `${id}.png` };
    expect(saveExpense(repoWith(stored), { ...stored, date: '2027-01-02' })).toEqual({
      ok: false,
      issues: [
        { path: 'date', message: 'Upload the receipt again to move the expense to another year.' },
      ],
    });
  });
});

describe('deleteExpense', () => {
  it('removes the YAML and the receipt', () => {
    const stored = { ...expense, receipt: `${id}.png` };
    const v = ok(deleteExpense(repoWith(stored), id));
    expect(v.changes).toEqual({
      [`${DIR}/2026/${id}.yaml`]: null,
      [`${DIR}/2026/${id}.png`]: null,
    });
    expect(v.message).toBe('business: delete expense Bahn 2026-10-20');
  });

  it('removes only the YAML without a receipt, and refuses an unknown id', () => {
    expect(ok(deleteExpense(repoWith(expense), id)).changes).toEqual({
      [`${DIR}/2026/${id}.yaml`]: null,
    });
    expect(deleteExpense(repoWith(), id).ok).toBe(false);
  });
});
