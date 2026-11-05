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
  paid >= gross || gross <= 0 ? amount : share(amount, paid, gross);

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
  const creditNotes: Issued[] = [];
  for (const { doc } of repo.issued) {
    if (doc.kind === 'invoice') invoices.set(doc.number, doc);
    else if (doc.kind === 'credit-note') creditNotes.push(doc);
  }
  // Ist nets a credit note into the invoice it corrects (ruling S4); one without a known
  // invoice, and every credit note under Soll, counts by its issue date.
  const netted = (c: Issued) => basis === 'cash' && !!c.corrects && invoices.has(c.corrects);
  for (const c of creditNotes) if (!netted(c) && inPeriod(c.issue_date)) addDoc(c, -1);

  if (basis === 'accrual') {
    for (const doc of invoices.values()) if (inPeriod(doc.issue_date)) addDoc(doc, 1);
  } else {
    type Event = { date: string; order: string; invoice: string } & (
      | { kind: 'payment'; amount: number }
      | { kind: 'credit'; doc: Issued }
    );
    const events: Event[] = [
      ...repo.payments
        .filter((p) => invoices.has(p.invoice))
        .map(
          (p): Event => ({
            kind: 'payment',
            date: p.date,
            order: p.id,
            invoice: p.invoice,
            amount: p.amount,
          }),
        ),
      ...creditNotes.filter(netted).map(
        (c): Event => ({
          kind: 'credit',
          date: c.issue_date,
          order: c.number,
          invoice: c.corrects ?? '',
          doc: c,
        }),
      ),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order));

    type State = {
      gross: number;
      paid: number;
      rows: Map<string, { category: VatCategory; rate: string; taxable: number; tax: number }>;
      taxed: Map<string, { taxable: number; tax: number }>;
    };
    const states = new Map<string, State>();
    const addRows = (state: State, doc: Issued, sign: 1 | -1) => {
      state.gross += sign * doc.totals.gross;
      for (const b of doc.totals.breakdown) {
        const key = `${b.category}|${b.rate}`;
        const row = state.rows.get(key) ?? {
          category: b.category,
          rate: b.rate,
          taxable: 0,
          tax: 0,
        };
        row.taxable += sign * b.taxable;
        row.tax += sign * b.tax;
        state.rows.set(key, row);
      }
    };
    const stateOf = (number: string): State => {
      const known = states.get(number);
      if (known) return known;
      const state: State = { gross: 0, paid: 0, rows: new Map(), taxed: new Map() };
      addRows(state, invoices.get(number) as Issued, 1);
      states.set(number, state);
      return state;
    };

    for (const e of events) {
      if (e.date > end) break;
      const state = stateOf(e.invoice);
      if (e.kind === 'payment') state.paid += e.amount;
      else addRows(state, e.doc, -1);
      // What payments so far cover of the effective invoice; a credit note that drops the gross
      // below what was already paid gives back only the VAT taxed beyond it.
      const paid = Math.min(state.paid, state.gross);
      for (const [key, row] of state.rows) {
        const done = state.taxed.get(key) ?? { taxable: 0, tax: 0 };
        const target = {
          taxable: allocated(row.taxable, paid, state.gross),
          tax: allocated(row.tax, paid, state.gross),
        };
        const taxable = target.taxable - done.taxable;
        const tax = target.tax - done.tax;
        state.taxed.set(key, target);
        if (inPeriod(e.date) && (taxable !== 0 || tax !== 0))
          add(row.category, row.rate, taxable, tax);
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
