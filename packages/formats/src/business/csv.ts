/** CSV for a German Steuerberater: UTF-8 with BOM, `;`, CRLF, decimal comma. */

import type { Expense, Issued, Payment } from './records.js';
import type { VatSummary } from './vat.js';

const NEEDS_QUOTES = /[;"\r\n]/;

const field = (value: string | number): string => {
  const text = String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
      e.supplier,
      e.description,
      e.category,
      csvAmount(e.net),
      csvRate(e.vat_rate),
      csvAmount(e.vat),
      csvAmount(e.gross),
      e.client ?? '',
      e.project ?? '',
      e.receipt ?? '',
    ]),
  ]);

const DOC_TYPE: Record<Issued['kind'], string> = {
  invoice: 'Rechnung',
  'credit-note': 'Gutschrift',
  offer: 'Angebot',
};

/** Credit notes are written negative and never open; `paid` is what the caller counts as received. */
export const invoicesCsv = (rows: readonly { issued: Issued; paid: number }[]): string =>
  csvTable([
    ['Nummer', 'Typ', 'Datum', 'Kunde', 'Netto', 'USt', 'Brutto', 'Bezahlt', 'Offen'],
    ...rows.map(({ issued: d, paid }) => {
      const credit = d.kind === 'credit-note';
      const sign = credit ? -1 : 1;
      return [
        d.number,
        DOC_TYPE[d.kind],
        d.issue_date,
        d.buyer.name,
        csvAmount(sign * d.totals.net),
        csvAmount(sign * d.totals.vat),
        csvAmount(sign * d.totals.gross),
        csvAmount(paid),
        csvAmount(credit ? 0 : Math.max(0, d.totals.gross - paid)),
      ];
    }),
  ]);

export const paymentsCsv = (payments: readonly Payment[]): string =>
  csvTable([
    ['Datum', 'Rechnung', 'Betrag', 'Methode', 'Referenz'],
    ...payments.map((p) => [p.date, p.invoice, csvAmount(p.amount), p.method ?? '', p.ref ?? '']),
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
