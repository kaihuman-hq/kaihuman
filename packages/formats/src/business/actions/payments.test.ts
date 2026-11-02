import { describe, expect, it } from 'vitest';
import { checkBusinessRepo } from '../check.js';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Ulid } from '../ids.js';
import { classifyBusinessPath, paymentsPath } from '../paths.js';
import { loadBusinessRepo } from '../repo.js';
import { recordPayment } from './payments.js';

const id = '01M5AMBK0038DJQW16BGNTZ49F' as Ulid;
const repo = loadBusinessRepo(loadFixtureRepo());
const pay = { date: '2027-01-03', invoice: 'RE-2026-0001', amount: 50000, method: 'transfer' };

describe('recordPayment', () => {
  it('appends to the payments file of the payment date year and names the invoice', () => {
    const r = recordPayment(repo, null, pay, id);
    if (!r.ok) throw new Error('expected ok');
    expect(Object.keys(r.value.changes)).toEqual([paymentsPath(2027)]);
    expect(classifyBusinessPath(paymentsPath(2027)).kind).toBe('payments');
    expect(r.value.changes[paymentsPath(2027)]).toBe(
      `{"id":"${id}","date":"2027-01-03","invoice":"RE-2026-0001","amount":50000,"method":"transfer"}\n`,
    );
    expect(r.value.message).toBe('business: payment 500.00 EUR for RE-2026-0001');
  });

  it('keeps the existing lines byte for byte', () => {
    const existing =
      '{"id":"01M5AMBK0038DJQW16BGNTZ49E","date":"2026-11-05","invoice":"RE-2026-0001","amount":100138}\n';
    const r = recordPayment(repo, existing, { ...pay, date: '2026-12-01' }, id);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.changes[paymentsPath(2026)]?.startsWith(existing)).toBe(true);
  });

  it('refuses an unknown invoice', () => {
    const r = recordPayment(repo, null, { ...pay, invoice: 'RE-2026-9999' }, id);
    expect(r).toMatchObject({ ok: false, issues: [{ path: 'invoice' }] });
  });

  it('refuses an offer as the target', () => {
    const r = recordPayment(repo, null, { ...pay, invoice: 'AN-2026-001' }, id);
    expect(r).toMatchObject({ ok: false, issues: [{ path: 'invoice' }] });
  });

  it('refuses a credit note', () => {
    const inv = repo.issued.find((i) => i.doc.number === 'RE-2026-0001');
    if (!inv) throw new Error('fixture');
    const withCredit = {
      ...repo,
      issued: [
        ...repo.issued,
        { path: 'x', doc: { ...inv.doc, number: 'GS-2026-0001', kind: 'credit-note' as const } },
      ],
    };
    const r = recordPayment(withCredit, null, { ...pay, invoice: 'GS-2026-0001' }, id);
    expect(r).toMatchObject({ ok: false, issues: [{ path: 'invoice' }] });
  });

  it('refuses a zero amount and a bad date', () => {
    expect(recordPayment(repo, null, { ...pay, amount: 0 }, id).ok).toBe(false);
    expect(recordPayment(repo, null, { ...pay, date: 'soon' }, id).ok).toBe(false);
  });

  it('produces a repository the check accepts', () => {
    const files = loadFixtureRepo();
    const r = recordPayment(repo, null, pay, id);
    if (!r.ok) throw new Error('expected ok');
    for (const [p, c] of Object.entries(r.value.changes)) if (c !== null) files.set(p, c);
    const errors = checkBusinessRepo({ files, changes: null, today: '2027-01-10' }).filter(
      (f) => f.level === 'error',
    );
    expect(errors).toEqual([]);
  });
});
