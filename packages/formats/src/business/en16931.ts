/**
 * Plain EN 16931 invoice data (BT = business term, BG = business group). Phase 6 serializes this
 * to XRechnung XML, so each field name says which term it carries. Amounts are decimal strings
 * with 2 places; a credit note keeps positive amounts and says so with type code 381.
 */

import { formatMinor } from './money.js';
import type { Address, Issued, Party, VatCategory } from './records.js';
import { lineNet } from './totals.js';

export type En16931Address = {
  street: string; // BT-35 / BT-50
  city: string; // BT-37 / BT-52
  postcode: string; // BT-38 / BT-53
  country: string; // BT-40 / BT-55
};

export type En16931Party = {
  name: string; // BT-27 / BT-44
  address: En16931Address; // BG-5 / BG-8
  vatId?: string; // BT-31 / BT-48
  taxNumber?: string; // BT-32
  electronicAddress?: string; // BT-34 / BT-49
  contact?: { name: string; email?: string; phone?: string }; // BG-6 (seller)
};

export type En16931Line = {
  id: string; // BT-126
  name: string; // BT-153
  quantity: string; // BT-129
  unitCode: string; // BT-130
  netAmount: string; // BT-131
  unitPrice: string; // BT-146
  vatCategory: VatCategory; // BT-151
  vatRate: string; // BT-152
};

export type En16931VatBreakdown = {
  taxableAmount: string; // BT-116
  taxAmount: string; // BT-117
  categoryCode: VatCategory; // BT-118
  rate: string; // BT-119
  exemptionReason?: string; // BT-120
};

export type En16931Invoice = {
  invoiceNumber: string; // BT-1
  issueDate: string; // BT-2
  typeCode: '380' | '381'; // BT-3
  currency: string; // BT-5
  dueDate?: string; // BT-9
  buyerReference?: string; // BT-10
  precedingInvoice?: string; // BG-3 / BT-25
  seller: En16931Party; // BG-4
  buyer: En16931Party; // BG-7
  deliveryDate?: string; // BT-72
  servicePeriod?: { start: string; end: string }; // BG-14 / BT-73, BT-74
  paymentMeans?: { code: '58'; iban: string; bic?: string; reference: string }; // BG-16 / BT-81, BT-84, BT-86, BT-83
  lines: En16931Line[]; // BG-25
  vatBreakdown: En16931VatBreakdown[]; // BG-23
  totals: {
    lineNetTotal: string; // BT-106
    taxExclusive: string; // BT-109
    tax: string; // BT-110
    taxInclusive: string; // BT-112
    payable: string; // BT-115
  }; // BG-22
  notes: string[]; // BT-22
};

const address = (a: Address): En16931Address => ({
  street: a.street,
  city: a.city,
  postcode: a.postcode,
  country: a.country,
});

const party = (p: Party): En16931Party => ({
  name: p.name,
  address: address(p.address),
  ...(p.vat_id ? { vatId: p.vat_id } : {}),
  ...(p.tax_number ? { taxNumber: p.tax_number } : {}),
  ...(p.electronic_address ? { electronicAddress: p.electronic_address } : {}),
  ...(p.contact ? { contact: p.contact } : {}),
});

export const toEn16931 = (invoice: Issued): En16931Invoice => {
  if (invoice.type_code === null) {
    throw new Error(`${invoice.number} is an offer; EN 16931 covers invoices and credit notes`);
  }
  const cur = invoice.currency ?? 'EUR';
  const m = (minor: number) => formatMinor(minor, cur);
  const buyerReference =
    invoice.buyer_reference ?? invoice.buyer.leitweg_id ?? invoice.buyer.buyer_reference;
  const { service_period: period, service_date: date, payment } = invoice;
  return {
    invoiceNumber: invoice.number,
    issueDate: invoice.issue_date,
    typeCode: invoice.type_code === 380 ? '380' : '381',
    currency: cur,
    ...(invoice.due_date ? { dueDate: invoice.due_date } : {}),
    ...(buyerReference ? { buyerReference } : {}),
    ...(invoice.corrects ? { precedingInvoice: invoice.corrects } : {}),
    seller: party(invoice.seller),
    buyer: party(invoice.buyer),
    ...(date ? { deliveryDate: date } : {}),
    ...(period ? { servicePeriod: { start: period.start, end: period.end } } : {}),
    ...(payment
      ? {
          paymentMeans: {
            code: payment.means_code,
            iban: payment.iban,
            ...(payment.bic ? { bic: payment.bic } : {}),
            reference: payment.reference,
          },
        }
      : {}),
    lines: invoice.lines.map((l, i) => ({
      id: String(i + 1),
      name: l.description,
      quantity: l.quantity,
      unitCode: l.unit,
      netAmount: m(lineNet(l)),
      unitPrice: m(l.unit_price),
      vatCategory: l.vat_category,
      vatRate: l.vat_rate,
    })),
    vatBreakdown: invoice.totals.breakdown.map((b) => ({
      taxableAmount: m(b.taxable),
      taxAmount: m(b.tax),
      categoryCode: b.category,
      rate: b.rate,
      ...(b.exemption_reason ? { exemptionReason: b.exemption_reason } : {}),
    })),
    totals: {
      lineNetTotal: m(invoice.totals.net),
      taxExclusive: m(invoice.totals.net),
      tax: m(invoice.totals.vat),
      taxInclusive: m(invoice.totals.gross),
      payable: m(invoice.totals.gross),
    },
    notes: [...(invoice.notes ? [invoice.notes] : []), ...invoice.legal_notes],
  };
};
