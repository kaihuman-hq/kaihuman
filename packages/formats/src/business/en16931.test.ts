import { describe, expect, it } from 'vitest';
import { toEn16931 } from './en16931.js';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Issued } from './records.js';
import { validateIssued } from './validate.js';
import { parseYaml } from './yaml.js';

const load = (path: string): Issued => {
  const parsed = parseYaml(loadFixtureRepo().get(`.kh/business/${path}`) ?? '');
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const r = validateIssued(parsed.value);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

const inv = load('invoices/2026/RE-2026-0001.yaml');
const offer = load('offers/2026/AN-2026-001.yaml');
const { payment: _p, due_date: _d, ...invWithoutPayment } = inv;
const credit: Issued = {
  ...invWithoutPayment,
  number: 'RE-2026-0002',
  kind: 'credit-note',
  type_code: 381,
  corrects: inv.number,
};

describe('toEn16931', () => {
  const e = toEn16931(inv);

  it('maps header and totals', () => {
    expect(e).toMatchObject({
      invoiceNumber: inv.number,
      issueDate: '2026-10-26',
      typeCode: '380',
      currency: 'EUR',
      dueDate: '2026-11-09',
      totals: {
        lineNetTotal: '842.50',
        taxExclusive: '842.50',
        tax: '158.88',
        taxInclusive: '1001.38',
        payable: '1001.38',
      },
    });
    expect(e.precedingInvoice).toBeUndefined();
  });

  it('maps payment means from the invoice', () => {
    expect(e.paymentMeans).toEqual({
      code: '58',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      reference: inv.number,
    });
  });

  it('maps lines with per-line rounded nets', () => {
    expect(e.lines).toEqual([
      {
        id: '1',
        name: 'Dev',
        quantity: '7.5',
        unitCode: 'HUR',
        netAmount: '712.50',
        unitPrice: '95.00',
        vatCategory: 'S',
        vatRate: '19',
      },
      {
        id: '2',
        name: 'Setup',
        quantity: '1',
        unitCode: 'C62',
        netAmount: '120.00',
        unitPrice: '120.00',
        vatCategory: 'S',
        vatRate: '19',
      },
      {
        id: '3',
        name: 'Book',
        quantity: '1',
        unitCode: 'C62',
        netAmount: '10.00',
        unitPrice: '10.00',
        vatCategory: 'S',
        vatRate: '7',
      },
    ]);
  });

  it('maps the VAT breakdown, parties and service period', () => {
    expect(e.vatBreakdown).toEqual([
      { taxableAmount: '832.50', taxAmount: '158.18', categoryCode: 'S', rate: '19' },
      { taxableAmount: '10.00', taxAmount: '0.70', categoryCode: 'S', rate: '7' },
    ]);
    expect(e.seller).toMatchObject({
      name: 'Kai Mustermann',
      vatId: 'DE123456789',
      address: { street: 'Musterstrasse 1', postcode: '10115', city: 'Berlin', country: 'DE' },
    });
    expect(e.buyer).toMatchObject({ name: 'Acme GmbH', vatId: 'DE987654321' });
    expect(e.servicePeriod).toEqual({ start: '2026-10-01', end: '2026-10-25' });
  });

  it('keeps credit notes positive and points at the corrected invoice', () => {
    const c = toEn16931(credit);
    expect(c.typeCode).toBe('381');
    expect(c.precedingInvoice).toBe(inv.number);
    expect(c.totals.payable).toBe('1001.38');
    expect(c.paymentMeans).toBeUndefined();
    expect(c.dueDate).toBeUndefined();
  });

  it('takes the buyer reference from the document, then the Leitweg-ID', () => {
    expect(toEn16931({ ...inv, buyer_reference: '04011000-1234512345-35' }).buyerReference).toBe(
      '04011000-1234512345-35',
    );
    expect(
      toEn16931({ ...inv, buyer: { ...inv.buyer, leitweg_id: '991-01234-44' } }).buyerReference,
    ).toBe('991-01234-44');
  });

  it('throws for offers', () => {
    expect(() => toEn16931(offer)).toThrow(/offer/);
  });
});
