import { describe, expect, it } from 'vitest';
import { csvAmount, csvTable, expensesCsv, invoicesCsv, paymentsCsv, vatCsv } from './csv.js';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Ulid } from './ids.js';
import type { Issued } from './records.js';
import { validateIssued } from './validate.js';
import { parseYaml } from './yaml.js';

const BOM = '﻿';
const lines = (csv: string): string[] => csv.slice(1).split('\r\n');

const parsed = parseYaml(
  loadFixtureRepo().get('.kh/business/invoices/2026/RE-2026-0001.yaml') ?? '',
);
const issuedOk = validateIssued(parsed.ok ? parsed.value : null);
if (!issuedOk.ok) throw new Error('fixture invoice invalid');
const inv: Issued = issuedOk.value;

describe('csvTable', () => {
  it('writes a BOM, semicolons, CRLF and quotes only where needed', () => {
    expect(csvTable([['a;b', 'x"y'], [1]])).toBe(`${BOM}"a;b";"x""y"\r\n1\r\n`);
    expect(csvTable([['line\nbreak', 'cr\r', 'plain', -3]])).toBe(
      `${BOM}"line\nbreak";"cr\r";plain;-3\r\n`,
    );
  });
});

describe('csvAmount', () => {
  it('uses a decimal comma and a minus sign', () => {
    expect(csvAmount(-50)).toBe('-0,50');
    expect(csvAmount(123456)).toBe('1234,56');
    expect(csvAmount(0)).toBe('0,00');
    expect(csvAmount(-123456789)).toBe('-1234567,89');
  });
});

describe('expensesCsv', () => {
  it('writes the header and one row', () => {
    const csv = expensesCsv([
      {
        id: '01M55FJ500NTZ49EKRX27CHPV0' as Ulid,
        date: '2026-10-05',
        supplier: 'Bahn; DB',
        description: 'Ticket',
        category: 'travel',
        net: 9346,
        vat: 654,
        gross: 10000,
        vat_rate: '7',
        client: 'acme-gmbh' as Issued['client'],
        receipt: '01M55FJ500NTZ49EKRX27CHPV0.pdf',
      },
    ]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(lines(csv)).toEqual([
      'Datum;Lieferant;Beschreibung;Kategorie;Netto;USt-Satz;USt;Brutto;Kunde;Projekt;Beleg',
      '2026-10-05;"Bahn; DB";Ticket;travel;93,46;7;6,54;100,00;acme-gmbh;;01M55FJ500NTZ49EKRX27CHPV0.pdf',
      '',
    ]);
  });

  it('writes decimal rates with a comma', () => {
    const csv = expensesCsv([
      {
        id: '01M55FJ500NTZ49EKRX27CHPV0' as Ulid,
        date: '2026-10-05',
        supplier: 'X',
        description: 'Y',
        category: 'z',
        net: 100,
        vat: 8,
        gross: 108,
        vat_rate: '7.5',
      },
    ]);
    expect(lines(csv)[1]).toBe('2026-10-05;X;Y;z;1,00;7,5;0,08;1,08;;;');
  });
});

describe('invoicesCsv', () => {
  it('writes invoices and credit notes, credit notes negative', () => {
    const cn: Issued = {
      ...inv,
      number: 'RE-2026-0002',
      kind: 'credit-note',
      type_code: 381,
      issue_date: '2026-11-01',
      corrects: inv.number,
      totals: { net: 1000, vat: 190, gross: 1190, breakdown: [] },
    };
    expect(
      lines(
        invoicesCsv([
          { issued: inv, paid: 50000 },
          { issued: cn, paid: 0 },
        ]),
      ),
    ).toEqual([
      'Nummer;Typ;Datum;Kunde;Netto;USt;Brutto;Bezahlt;Offen',
      'RE-2026-0001;Rechnung;2026-10-26;Acme GmbH;842,50;158,88;1001,38;500,00;501,38',
      'RE-2026-0002;Gutschrift;2026-11-01;Acme GmbH;-10,00;-1,90;-11,90;0,00;0,00',
      '',
    ]);
  });
});

describe('paymentsCsv', () => {
  it('writes the header and one row', () => {
    expect(
      lines(
        paymentsCsv([
          {
            id: '01M5KA3Q00W16BGNTZ49EKRX28' as Ulid,
            date: '2026-11-02',
            invoice: 'RE-2026-0001',
            amount: 100138,
            method: 'bank',
            ref: 'RE-2026-0001',
          },
          {
            id: '01M5KA3Q00W16BGNTZ49EKRX29' as Ulid,
            date: '2026-11-03',
            invoice: 'RE-2026-0002',
            amount: 5,
          },
        ]),
      ),
    ).toEqual([
      'Datum;Rechnung;Betrag;Methode;Referenz',
      '2026-11-02;RE-2026-0001;1001,38;bank;RE-2026-0001',
      '2026-11-03;RE-2026-0002;0,05;;',
      '',
    ]);
  });
});

describe('vatCsv', () => {
  it('writes Soll/Ist summaries and zeros for small business', () => {
    expect(
      lines(
        vatCsv([
          {
            applicable: true,
            period: '2026-Q4',
            basis: 'accrual',
            output: [],
            outputTax: 17408,
            inputTax: 1900,
            reverseChargeNet: 30000,
            payable: 15508,
          },
          {
            applicable: true,
            period: '2026-11',
            basis: 'cash',
            output: [],
            outputTax: 100,
            inputTax: 300,
            reverseChargeNet: 0,
            payable: -200,
          },
          { applicable: false, period: '2026', reason: 'small-business' },
        ]),
      ),
    ).toEqual([
      'Zeitraum;Basis;Umsatzsteuer;Vorsteuer;Reverse-Charge netto;Zahllast',
      '2026-Q4;Soll;174,08;19,00;300,00;155,08',
      '2026-11;Ist;1,00;3,00;0,00;-2,00',
      '2026;Kleinunternehmer;0,00;0,00;0,00;0,00',
      '',
    ]);
  });
});
