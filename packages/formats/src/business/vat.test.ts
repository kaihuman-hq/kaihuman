import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Ulid } from './ids.js';
import type { BusinessProfile, Expense, Issued, Payment, Totals } from './records.js';
import type { BusinessRepo } from './repo.js';
import { validateIssued, validateProfile } from './validate.js';
import { periodRange, vatSummary } from './vat.js';
import { parseYaml } from './yaml.js';

const load = (path: string): unknown => {
  const parsed = parseYaml(loadFixtureRepo().get(`.kh/business/${path}`) ?? '');
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.value;
};
const issuedOk = validateIssued(load('invoices/2026/RE-2026-0001.yaml'));
if (!issuedOk.ok) throw new Error('fixture invoice invalid');
const base = issuedOk.value;
const profileRaw = load('business.yaml') as Record<string, unknown>;
const profileOk = validateProfile(profileRaw);
if (!profileOk.ok) throw new Error('fixture profile invalid');
const profile = profileOk.value;

const invoice = (number: string, issue_date: string, totals: Totals): Issued => ({
  ...base,
  number,
  issue_date,
  totals,
});
const credit = (number: string, issue_date: string, totals: Totals): Issued => ({
  ...invoice(number, issue_date, totals),
  kind: 'credit-note',
  type_code: 381,
  corrects: 'RE-2026-0001',
});
const s19 = (taxable: number, tax: number): Totals => ({
  net: taxable,
  vat: tax,
  gross: taxable + tax,
  breakdown: [{ category: 'S', rate: '19', taxable, tax }],
});
let seq = 0;
const pay = (date: string, invoiceNo: string, amount: number): Payment => ({
  id: `01M5KA3Q00W16BGNTZ49EKR${String(seq++).padStart(3, '0')}` as Ulid,
  date,
  invoice: invoiceNo,
  amount,
});
const expense = (date: string, vat: number): Expense => ({
  id: '01M55FJ500NTZ49EKRX27CHPV0' as Ulid,
  date,
  supplier: 'Shop',
  description: 'Laptop',
  category: 'hardware',
  net: 10000,
  vat,
  gross: 10000 + vat,
  vat_rate: '19',
});
const repoOf = (
  issued: Issued[],
  opts: { payments?: Payment[]; expenses?: Expense[]; profile?: BusinessProfile } = {},
): BusinessRepo => ({
  profile: opts.profile ?? profile,
  clients: [],
  projects: [],
  contracts: [],
  drafts: [],
  issued: issued.map((doc) => ({ path: `.kh/business/invoices/2026/${doc.number}.yaml`, doc })),
  time: [],
  timer: null,
  payments: opts.payments ?? [],
  events: [],
  links: [],
  expenses: opts.expenses ?? [],
  clientFiles: [],
  artifacts: new Set(),
  findings: [],
});
const cash = { ...profile, vat_basis: 'cash' as const };

describe('periodRange', () => {
  it('covers quarters, months and years', () => {
    expect(periodRange('2026-Q4')).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    expect(periodRange('2026-Q1')).toEqual({ start: '2026-01-01', end: '2026-03-31' });
    expect(periodRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('2028-02').end).toBe('2028-02-29');
    expect(periodRange('2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('throws on a bad period', () => {
    for (const p of ['2026-Q5', '2026-13', '2026-00', '26', '2026-1', 'x']) {
      expect(() => periodRange(p), p).toThrow(`Invalid period: ${p}`);
    }
  });
});

describe('vatSummary, accrual', () => {
  it('counts invoices and credit notes by issue date, grouped by category and rate', () => {
    const repo = repoOf(
      [
        base, // 2026-10-26: S 19 83250/15818 + S 7 1000/70
        invoice('RE-2026-0002', '2026-12-31', s19(10000, 1900)),
        credit('RE-2026-0003', '2026-11-15', s19(2000, 380)),
        invoice('RE-2026-0004', '2026-09-30', s19(50000, 9500)),
        { ...invoice('AN-2026-001', '2026-11-01', s19(1000, 190)), kind: 'offer', type_code: null },
      ],
      { expenses: [expense('2026-11-03', 1900), expense('2027-01-01', 500)] },
    );
    expect(vatSummary(repo, '2026-Q4')).toEqual({
      applicable: true,
      period: '2026-Q4',
      basis: 'accrual',
      output: [
        { rate: '19', category: 'S', taxable: 91250, tax: 17338 },
        { rate: '7', category: 'S', taxable: 1000, tax: 70 },
      ],
      outputTax: 17408,
      inputTax: 1900,
      reverseChargeNet: 0,
      payable: 15508,
    });
  });

  it('reports reverse-charge net from AE rows', () => {
    const ae: Totals = {
      net: 30000,
      vat: 0,
      gross: 30000,
      breakdown: [
        { category: 'AE', rate: '0', taxable: 30000, tax: 0, exemption_reason: 'Reverse charge' },
      ],
    };
    const s = vatSummary(repoOf([invoice('RE-2026-0002', '2026-11-01', ae)]), '2026-11');
    expect(s).toMatchObject({ reverseChargeNet: 30000, outputTax: 0, payable: 0 });
  });

  it('is accrual when the profile is missing', () => {
    const repo = { ...repoOf([]), profile: null };
    expect(vatSummary(repo, '2026')).toMatchObject({ applicable: true, basis: 'accrual' });
  });
});

describe('vatSummary, cash', () => {
  it('cash basis splits VAT across part payments and sums exactly', () => {
    const inv = invoice('RE-2026-0002', '2026-01-10', s19(10000, 1900));
    const repo = repoOf([inv], {
      profile: cash,
      payments: [pay('2026-02-01', inv.number, 5000), pay('2026-04-15', inv.number, 6900)],
    });
    const q1 = vatSummary(repo, '2026-Q1');
    const q2 = vatSummary(repo, '2026-Q2');
    expect(q1).toMatchObject({
      basis: 'cash',
      output: [{ category: 'S', rate: '19', taxable: 4202, tax: 798 }],
      outputTax: 798,
    });
    expect(q2).toMatchObject({
      output: [{ category: 'S', rate: '19', taxable: 5798, tax: 1102 }],
      outputTax: 1102,
    });
    expect(vatSummary(repo, '2026')).toMatchObject({ outputTax: 1900 });
  });

  it('splits several rows and gives the completing payment the exact remainder', () => {
    const inv = { ...base, issue_date: '2026-01-10' }; // gross 100138, 15818 + 70 tax
    const thirds = [33379, 33379, 33380];
    const repo = repoOf([inv], {
      profile: cash,
      payments: [
        pay('2026-01-15', inv.number, thirds[0] ?? 0),
        pay('2026-05-15', inv.number, thirds[1] ?? 0),
        pay('2026-08-15', inv.number, thirds[2] ?? 0),
      ],
    });
    const taxes = ['2026-Q1', '2026-Q2', '2026-Q3'].map((p) => {
      const s = vatSummary(repo, p);
      if (!s.applicable) throw new Error('not applicable');
      return s.output;
    });
    const total = (rate: string, key: 'tax' | 'taxable') =>
      taxes.flat().reduce((a, r) => a + (r.rate === rate ? r[key] : 0), 0);
    expect(total('19', 'tax')).toBe(15818);
    expect(total('7', 'tax')).toBe(70);
    expect(total('19', 'taxable')).toBe(83250);
    expect(total('7', 'taxable')).toBe(1000);
  });

  it('cash basis caps at invoice gross', () => {
    const inv = invoice('RE-2026-0002', '2026-01-10', s19(10000, 1900));
    const cn = credit('RE-2026-0003', '2026-05-02', s19(1000, 190));
    const repo = repoOf([inv, cn], {
      profile: cash,
      payments: [
        pay('2026-02-01', inv.number, 11000),
        pay('2026-04-15', inv.number, 5000), // 900 completes, the rest is overpayment
        pay('2026-06-01', inv.number, 100), // pure overpayment
        pay('2026-06-02', cn.number, 1190), // on the credit note: ignored
      ],
    });
    const q1 = vatSummary(repo, '2026-Q1');
    const q2 = vatSummary(repo, '2026-Q2');
    expect(q1).toMatchObject({ outputTax: 1756 });
    // 1900 − 1756 from the completing payment, minus the credit note by issue date.
    expect(q2).toMatchObject({ outputTax: 144 - 190 });
    expect(vatSummary(repo, '2026')).toMatchObject({ outputTax: 1900 - 190 });
  });

  it('cash basis nets a cancelling credit note into an unpaid invoice', () => {
    const inv = invoice('RE-2026-0001', '2026-01-10', s19(1000, 190));
    const cn = credit('RE-2026-0002', '2026-01-20', s19(1000, 190));
    const re = invoice('RE-2026-0003', '2026-01-21', s19(1000, 190));
    const repo = repoOf([inv, cn, re], {
      profile: cash,
      payments: [pay('2026-02-01', re.number, 1190)],
    });
    expect(vatSummary(repo, '2026-Q1')).toMatchObject({
      output: [{ category: 'S', rate: '19', taxable: 1000, tax: 190 }],
      outputTax: 190,
    });
  });

  it('cash basis shares payments against the gross left after a credit note', () => {
    const inv = invoice('RE-2026-0001', '2026-01-10', s19(1000, 190));
    const cn = credit('RE-2026-0002', '2026-01-20', s19(500, 95));
    const repo = repoOf([inv, cn], {
      profile: cash,
      payments: [pay('2026-02-01', inv.number, 595)],
    });
    expect(vatSummary(repo, '2026-Q1')).toMatchObject({
      output: [{ category: 'S', rate: '19', taxable: 500, tax: 95 }],
      outputTax: 95,
    });
  });

  it('cash basis counts a credit note only for VAT already taxed beyond the new gross', () => {
    const inv = invoice('RE-2026-0001', '2026-01-10', s19(1000, 190));
    const cn = credit('RE-2026-0002', '2026-04-20', s19(500, 95));
    const repo = repoOf([inv, cn], {
      profile: cash,
      payments: [pay('2026-02-01', inv.number, 714)], // 114 VAT taxed in Q1
    });
    expect(vatSummary(repo, '2026-Q1')).toMatchObject({ outputTax: 114 });
    // Only 595 gross (95 VAT) remain: the 19 already taxed beyond it comes back in Q2.
    expect(vatSummary(repo, '2026-Q2')).toMatchObject({ outputTax: -19 });
  });

  it('ignores payments outside the period but counts them as paid before', () => {
    const inv = invoice('RE-2026-0002', '2025-12-10', s19(10000, 1900));
    const repo = repoOf([inv], {
      profile: cash,
      payments: [pay('2025-12-20', inv.number, 5000), pay('2026-01-05', inv.number, 6900)],
      expenses: [expense('2026-02-01', 300)],
    });
    expect(vatSummary(repo, '2026-Q1')).toMatchObject({
      outputTax: 1102,
      inputTax: 300,
      payable: 802,
    });
  });
});

describe('vatSummary, small business', () => {
  it('is not applicable', () => {
    const repo = repoOf([base], { profile: { ...profile, vat_regime: 'small-business' } });
    expect(vatSummary(repo, '2026-Q4')).toEqual({
      applicable: false,
      period: '2026-Q4',
      reason: 'small-business',
    });
  });
});

describe('vat_basis in the profile', () => {
  it('accepts accrual and cash, rejects others, and is absent by default', () => {
    expect(profile.vat_basis).toBeUndefined();
    for (const vat_basis of ['accrual', 'cash'] as const) {
      const r = validateProfile({ ...profileRaw, vat_basis });
      expect(r.ok && r.value.vat_basis).toBe(vat_basis);
    }
    const bad = validateProfile({ ...profileRaw, vat_basis: 'soll' });
    expect(bad.ok ? [] : bad.issues.map((i) => i.path)).toEqual(['vat_basis']);
  });
});
