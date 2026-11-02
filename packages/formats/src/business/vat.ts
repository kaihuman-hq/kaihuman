import type { Issued, VatCategory } from './records.js';
import { VAT_CATEGORIES } from './records.js';
import type { BusinessRepo } from './repo.js';

/** `YYYY-MM`, `YYYY-Qn` or `YYYY`. */
export type VatPeriod = string;

export type VatOutputRow = { rate: string; category: VatCategory; taxable: number; tax: number };

export type VatSummary =
  | { applicable: false; period: VatPeriod; reason: 'small-business' }
  | {
      applicable: true;
      period: VatPeriod;
      basis: 'accrual' | 'cash';
      output: VatOutputRow[];
      outputTax: number;
      inputTax: number;
      reverseChargeNet: number;
      payable: number;
    };

const PERIOD = /^(\d{4})(?:-(0[1-9]|1[0-2])|-Q([1-4]))?$/;

const pad = (n: number): string => String(n).padStart(2, '0');
const lastDay = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Inclusive ISO date bounds of a period. */
export const periodRange = (period: VatPeriod): { start: string; end: string } => {
  const m = PERIOD.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  const year = Number(m[1]);
  const [first, last] = m[2]
    ? [Number(m[2]), Number(m[2])]
    : m[3]
      ? [Number(m[3]) * 3 - 2, Number(m[3]) * 3]
      : [1, 12];
  return {
    start: `${year}-${pad(first)}-01`,
    end: `${year}-${pad(last)}-${pad(lastDay(year, last))}`,
  };
};

/** `amount × part / whole`, rounded half up away from zero, in exact integer arithmetic. */
const share = (amount: number, part: number, whole: number): number => {
  const n = BigInt(amount) * BigInt(part);
  const d = BigInt(whole);
  const abs = n < 0n ? -n : n;
  const r = (2n * abs + d) / (2n * d);
  return Number(n < 0n ? -r : r);
};

/**
 * The part of `amount` that belongs to the first `paid` of `gross`. Reaching the gross gives the
 * whole amount, so the payment that completes an invoice takes the exact remainder.
 */
const allocated = (amount: number, paid: number, gross: number): number =>
  paid >= gross ? amount : share(amount, paid, gross);

export const vatSummary = (repo: BusinessRepo, period: VatPeriod): VatSummary => {
  const { start, end } = periodRange(period);
  if (repo.profile?.vat_regime === 'small-business') {
    return { applicable: false, period, reason: 'small-business' };
  }
  const basis = repo.profile?.vat_basis ?? 'accrual';
  const inPeriod = (date: string) => date >= start && date <= end;

  const rows = new Map<string, VatOutputRow>();
  const add = (category: VatCategory, rate: string, taxable: number, tax: number) => {
    const key = `${category}|${rate}`;
    const row = rows.get(key) ?? { rate, category, taxable: 0, tax: 0 };
    row.taxable += taxable;
    row.tax += tax;
    rows.set(key, row);
  };
  const addDoc = (doc: Issued, sign: 1 | -1) => {
    for (const b of doc.totals.breakdown) add(b.category, b.rate, sign * b.taxable, sign * b.tax);
  };

  const invoices = new Map<string, Issued>();
  for (const { doc } of repo.issued) {
    if (doc.kind === 'invoice') invoices.set(doc.number, doc);
    // Credit notes count by issue date in both bases.
    else if (doc.kind === 'credit-note' && inPeriod(doc.issue_date)) addDoc(doc, -1);
  }

  if (basis === 'accrual') {
    for (const doc of invoices.values()) if (inPeriod(doc.issue_date)) addDoc(doc, 1);
  } else {
    const paidSoFar = new Map<string, number>();
    const payments = [...repo.payments].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    for (const p of payments) {
      if (p.date > end) break;
      const doc = invoices.get(p.invoice);
      if (!doc) continue;
      const gross = doc.totals.gross;
      const before = Math.min(paidSoFar.get(p.invoice) ?? 0, gross);
      const total = (paidSoFar.get(p.invoice) ?? 0) + p.amount;
      paidSoFar.set(p.invoice, total);
      const after = Math.min(total, gross);
      if (!inPeriod(p.date) || gross <= 0 || after === before) continue;
      for (const b of doc.totals.breakdown) {
        add(
          b.category,
          b.rate,
          allocated(b.taxable, after, gross) - allocated(b.taxable, before, gross),
          allocated(b.tax, after, gross) - allocated(b.tax, before, gross),
        );
      }
    }
  }

  const output = [...rows.values()].sort(
    (a, b) =>
      VAT_CATEGORIES.indexOf(a.category) - VAT_CATEGORIES.indexOf(b.category) ||
      Number(b.rate) - Number(a.rate),
  );
  const outputTax = output.reduce((s, r) => s + r.tax, 0);
  const inputTax = repo.expenses.filter((e) => inPeriod(e.date)).reduce((s, e) => s + e.vat, 0);
  const reverseChargeNet = output
    .filter((r) => r.category === 'AE')
    .reduce((s, r) => s + r.taxable, 0);
  return {
    applicable: true,
    period,
    basis,
    output,
    outputTax,
    inputTax,
    reverseChargeNet,
    payable: outputTax - inputTax,
  };
};
