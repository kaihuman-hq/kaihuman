/** CSV for a German Steuerberater: UTF-8 with BOM, `;`, CRLF, decimal comma. */

import type { Expense, Issued, Payment } from './records.js';
import type { BusinessRepo } from './repo.js';
import { deriveInvoiceStatus } from './status.js';
import type { VatSummary } from './vat.js';

const NEEDS_QUOTES = /[;"\r\n]/;

const field = (value: string | number): string => {
  const text = String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const FORMULA_START = /^[=+@\t\r]/;

/**
 * A free-text field that a spreadsheet would run as a formula gets a leading `'`. Only text
 * fields: amounts start with `-` and must stay numbers.
 */
const text = (value: string | undefined): string => {
  const v = value ?? '';
  return FORMULA_START.test(v) ? `'${v}` : v;
};

export const csvTable = (rows: (string | number)[][]): string =>
  `﻿${rows.map((r) => `${r.map(field).join(';')}\r\n`).join('')}`;

/** Minor units as `1234,56`: no thousands separator, `-` for negatives. */
export const csvAmount = (minor: number): string => {
  const abs = Math.abs(minor);
  const digits = String(abs).padStart(3, '0');
  return `${minor < 0 ? '-' : ''}${digits.slice(0, -2)},${digits.slice(-2)}`;
};

const csvRate = (rate: string): string => rate.replace('.', ',');

export const expensesCsv = (expenses: readonly Expense[]): string =>
  csvTable([
    [
      'Datum',
      'Lieferant',
      'Beschreibung',
      'Kategorie',
      'Netto',
      'USt-Satz',
      'USt',
      'Brutto',
      'Kunde',
      'Projekt',
      'Beleg',
    ],
    ...expenses.map((e) => [
      e.date,
      text(e.supplier),
      text(e.description),
      text(e.category),
      csvAmount(e.net),
      csvRate(e.vat_rate),
      csvAmount(e.vat),
      csvAmount(e.gross),
      text(e.client),
      text(e.project),
      text(e.receipt),
    ]),
  ]);

const DOC_TYPE: Record<Issued['kind'], string> = {
  invoice: 'Rechnung',
  'credit-note': 'Rechnungskorrektur',
  offer: 'Angebot',
};

/** `paid` and `open` come from `deriveInvoiceStatus`, so the CSV never re-derives status. */
export type InvoiceCsvRow = { issued: Issued; paid: number; open: number };

/** Invoices and credit notes issued in `year`, by issue date then number; credit notes are never open. */
export const invoiceCsvRows = (repo: BusinessRepo, year: number): InvoiceCsvRow[] => {
  const docs = repo.issued
    .map(({ doc }) => doc)
    .filter((d) => d.kind !== 'offer' && d.issue_date.startsWith(`${year}-`))
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number.localeCompare(b.number));
  const creditNotes = repo.issued.map(({ doc }) => doc).filter((d) => d.kind === 'credit-note');
  return docs.map((issued) => {
    // `today` only decides overdue/sent states; paid and open do not depend on it.
    const status = deriveInvoiceStatus(issued, repo.payments, creditNotes, [], issued.issue_date);
    return {
      issued,
      paid: status.paid,
      open: issued.kind === 'credit-note' ? 0 : status.open,
    };
  });
};

/** Credit notes are written negative and never open. */
export const invoicesCsv = (rows: readonly InvoiceCsvRow[]): string =>
  csvTable([
    ['Nummer', 'Typ', 'Datum', 'Kunde', 'Netto', 'USt', 'Brutto', 'Bezahlt', 'Offen'],
    ...rows.map(({ issued: d, paid, open }) => {
      const credit = d.kind === 'credit-note';
      const sign = credit ? -1 : 1;
      return [
        d.number,
        DOC_TYPE[d.kind],
        d.issue_date,
        text(d.buyer.name),
        csvAmount(sign * d.totals.net),
        csvAmount(sign * d.totals.vat),
        csvAmount(sign * d.totals.gross),
        csvAmount(paid),
        csvAmount(credit ? 0 : open),
      ];
    }),
  ]);

export const paymentsCsv = (payments: readonly Payment[]): string =>
  csvTable([
    ['Datum', 'Rechnung', 'Betrag', 'Methode', 'Referenz'],
    ...payments.map((p) => [p.date, p.invoice, csvAmount(p.amount), text(p.method), text(p.ref)]),
  ]);

const BASIS = { accrual: 'Soll', cash: 'Ist' } as const;

/** Small-business periods keep their row with zeros, so a year's file has every period. */
export const vatCsv = (summaries: readonly VatSummary[]): string =>
  csvTable([
    ['Zeitraum', 'Basis', 'Umsatzsteuer', 'Vorsteuer', 'Reverse-Charge netto', 'Zahllast'],
    ...summaries.map((s) =>
      s.applicable
        ? [
            s.period,
            BASIS[s.basis],
            csvAmount(s.outputTax),
            csvAmount(s.inputTax),
            csvAmount(s.reverseChargeNet),
            csvAmount(s.payable),
          ]
        : [s.period, 'Kleinunternehmer', ...Array<string>(4).fill(csvAmount(0))],
    ),
  ]);
