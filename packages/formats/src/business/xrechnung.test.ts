import { describe, expect, it } from 'vitest';
import { einvoiceFixtures } from './einvoice-fixtures.test-helper.js';
import { type En16931Invoice, toEn16931 } from './en16931.js';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Issued } from './records.js';
import { validateIssued } from './validate.js';
import { electronicAddress, toCii, toUbl, xrechnungGaps } from './xrechnung.js';
import { parseYaml } from './yaml.js';

const fx = einvoiceFixtures();
const inv = toEn16931(fx.invoice);
const rc = toEn16931(fx['reverse-charge']);
const sb = toEn16931(fx['small-business']);
const cn = toEn16931(fx['credit-note']);

const order = (xml: string, ...tags: string[]) => {
  const at = tags.map((t) => xml.indexOf(t));
  expect(
    at.every((i) => i >= 0),
    `missing tag in ${tags.join(', ')}: ${at}`,
  ).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
};

describe('toUbl', () => {
  it('writes an Invoice root for 380 with BT-1, BT-3 and key elements in schema order', () => {
    const x = toUbl(inv);
    expect(x).toContain('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    expect(x).toContain('<cbc:ID>RE-2026-0001</cbc:ID>');
    expect(x).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    order(
      x,
      '<cbc:CustomizationID>',
      '<cbc:ProfileID>',
      '<cbc:ID>',
      '<cbc:IssueDate>',
      '<cbc:DueDate>',
      '<cbc:InvoiceTypeCode>',
      '<cbc:DocumentCurrencyCode>',
      '<cbc:BuyerReference>',
      '<cac:InvoicePeriod>',
      '<cac:AccountingSupplierParty>',
      '<cac:AccountingCustomerParty>',
      '<cac:PaymentMeans>',
      '<cac:TaxTotal>',
      '<cac:LegalMonetaryTotal>',
      '<cac:InvoiceLine>',
    );
    expect(x).toContain('<cbc:InvoicedQuantity unitCode="HUR">7.5</cbc:InvoicedQuantity>');
  });

  it('writes a CreditNote root for 381 with a BillingReference and no root DueDate', () => {
    const x = toUbl(cn);
    expect(x).toContain(
      '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
    );
    expect(x).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(x).toContain('<cac:CreditNoteLine>');
    expect(x).toContain('<cbc:CreditedQuantity unitCode="HUR">');
    expect(x).not.toContain('<cbc:DueDate>');
    expect(x).not.toContain('InvoiceLine');
    order(
      x,
      '<cbc:BuyerReference>',
      '<cac:InvoicePeriod>',
      '<cac:BillingReference>',
      '<cac:AccountingSupplierParty>',
    );
    expect(x).toContain('<cac:InvoiceDocumentReference>\n      <cbc:ID>RE-2026-0001</cbc:ID>');
  });

  it('puts a credit note due date into PaymentMeans in schema order', () => {
    const x = toUbl({ ...cn, dueDate: '2026-12-01', paymentMeans: inv.paymentMeans });
    order(
      x,
      '<cbc:PaymentMeansCode>58',
      '<cbc:PaymentDueDate>2026-12-01',
      '<cbc:PaymentID>',
      '<cac:PayeeFinancialAccount>',
    );
    expect(x).not.toContain('<cac:PaymentTerms>');
  });

  it('writes endpoint schemes, tax scheme ids and contact', () => {
    const x = toUbl(inv);
    expect(x).toContain('<cbc:EndpointID schemeID="EM">kai@example.com</cbc:EndpointID>');
    expect(x).toContain('<cbc:EndpointID schemeID="EM">rechnung@acme.example</cbc:EndpointID>');
    expect(x).toContain('<cbc:Telephone>+49 30 1234567</cbc:Telephone>');
    const s = toUbl(sb);
    expect(s).toContain(
      '<cbc:CompanyID>12/345/67890</cbc:CompanyID>\n        <cac:TaxScheme>\n          <cbc:ID>FC</cbc:ID>',
    );
    expect(s).not.toContain(
      '<cbc:ID>VAT</cbc:ID>\n        </cac:TaxScheme>\n      </cac:PartyTaxScheme>\n      <cac:PartyTaxScheme>',
    );
  });

  it('writes payment means 58 with IBAN and BIC', () => {
    const x = toUbl(inv);
    expect(x).toContain('<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>');
    expect(x).toContain('<cbc:PaymentID>RE-2026-0001</cbc:PaymentID>');
    expect(x).toContain('<cbc:ID>DE89370400440532013000</cbc:ID>');
    order(x, '<cac:FinancialInstitutionBranch>', '<cbc:ID>COBADEFFXXX</cbc:ID>');
    expect(x).not.toContain('<cac:PaymentTerms>');
  });

  it('uses code 1 and the refund text for a credit note without payment', () => {
    const x = toUbl(cn);
    expect(x).toContain('<cbc:PaymentMeansCode>1</cbc:PaymentMeansCode>');
    expect(x).not.toContain('PayeeFinancialAccount');
    expect(x).toContain(
      '<cbc:Note>Credit note: the seller refunds the amount or offsets it against open invoices.</cbc:Note>',
    );
    const noDue = toUbl({ ...inv, dueDate: undefined, paymentMeans: undefined });
    expect(noDue).toContain('Payable on receipt.');
  });

  it('writes VATEX-EU-AE for AE and the reason for E', () => {
    const r = toUbl(rc);
    expect(r).toContain('<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>');
    expect(r).toContain('<cbc:Percent>0</cbc:Percent>');
    expect(r).toContain(
      '<cbc:Note>Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).</cbc:Note>',
    );
    const s = toUbl(sb);
    expect(s).toContain(
      '<cbc:TaxExemptionReason>Kleinunternehmer gemäß § 19 UStG</cbc:TaxExemptionReason>',
    );
    expect(s).not.toContain('TaxExemptionReasonCode');
  });

  it('writes K as VATEX-EU-IC and omits Percent for O', () => {
    const k = toUbl({
      ...inv,
      vatBreakdown: [{ taxableAmount: '1.00', taxAmount: '0.00', categoryCode: 'K', rate: '5' }],
    });
    expect(k).toContain('VATEX-EU-IC');
    const o = toUbl({
      ...inv,
      vatBreakdown: [{ taxableAmount: '1.00', taxAmount: '0.00', categoryCode: 'O', rate: '19' }],
      lines: inv.lines.map((l) => ({ ...l, vatCategory: 'O' as const })),
    });
    expect(o).not.toContain('<cbc:Percent>');
    expect(o).toContain('<cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>');
  });

  it('writes the tax number as BT-29 for a seller without VAT id (BR-CO-26)', () => {
    const s = toUbl(sb);
    order(
      s,
      '<cbc:EndpointID schemeID="EM">kai@',
      '<cac:PartyIdentification>\n        <cbc:ID>12/345/67890</cbc:ID>',
      '<cac:PostalAddress>',
    );
    expect(toUbl(inv)).not.toContain('<cac:PartyIdentification>');
    expect(toCii(sb)).toContain(
      '<ram:SellerTradeParty>\n        <ram:ID>12/345/67890</ram:ID>\n        <ram:Name>',
    );
    expect(toCii(inv)).not.toContain('<ram:SellerTradeParty>\n        <ram:ID>');
  });

  it('writes no tax number for the buyer, for which EN 16931 has no such term', () => {
    const e = { ...inv, buyer: { ...inv.buyer, taxNumber: '99/999/99999' } };
    expect(toUbl(e)).not.toContain('99/999/99999');
    expect(toCii(e)).not.toContain('99/999/99999');
  });

  it('omits optional elements with blank text', () => {
    const pm = inv.paymentMeans;
    if (!pm) throw new Error('fixture has payment');
    const x = toUbl({ ...inv, paymentMeans: { ...pm, reference: '' } });
    expect(x).not.toContain('<cbc:PaymentID');
  });

  it('writes line and breakdown rates the same way', () => {
    const x = toUbl({ ...inv, lines: inv.lines.map((l) => ({ ...l, vatRate: '19.00' })) });
    expect(x).not.toContain('19.00</cbc:Percent>');
    expect(x).toContain('<cbc:Percent>19</cbc:Percent>');
  });

  it('copies amounts from toEn16931 and the tax total equals the sum of the breakdown', () => {
    const x = toUbl(inv);
    for (const v of [
      inv.totals.lineNetTotal,
      inv.totals.tax,
      inv.totals.taxInclusive,
      inv.totals.payable,
    ]) {
      expect(x).toContain(`currencyID="EUR">${v}<`);
    }
    for (const l of inv.lines)
      expect(x).toContain(`<cbc:PriceAmount currencyID="EUR">${l.unitPrice}<`);
    const cents = (s: string) => Math.round(Number(s) * 100);
    expect(inv.vatBreakdown.reduce((a, b) => a + cents(b.taxAmount), 0)).toBe(
      cents(inv.totals.tax),
    );
    expect(x).toContain(`<cbc:TaxAmount currencyID="EUR">${inv.totals.tax}</cbc:TaxAmount>`);
  });

  it('escapes special characters in text', () => {
    const [first, ...rest] = inv.lines;
    if (!first) throw new Error('fixture has lines');
    const x = toUbl({ ...inv, lines: [{ ...first, name: 'R&D <alpha> "x"' }, ...rest] });
    expect(x).toContain('<cbc:Name>R&amp;D &lt;alpha&gt; &quot;x&quot;</cbc:Name>');
    expect(toCii({ ...inv, lines: [{ ...first, name: 'A&B' }, ...rest] })).toContain(
      '<ram:Name>A&amp;B</ram:Name>',
    );
  });
});

describe('toCii', () => {
  it('writes the XRechnung guideline and business process by default', () => {
    const x = toCii(inv);
    expect(x).toContain(
      '<ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID>',
    );
    expect(x).toContain('<ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID>');
    expect(x).toContain('<ram:TypeCode>380</ram:TypeCode>');
    expect(x).toContain('<udt:DateTimeString format="102">20261026</udt:DateTimeString>');
    order(
      x,
      'ExchangedDocumentContext>',
      'ExchangedDocument>',
      'IncludedSupplyChainTradeLineItem>',
      'ApplicableHeaderTradeAgreement>',
      'ApplicableHeaderTradeDelivery',
      'ApplicableHeaderTradeSettlement>',
      '<ram:PaymentReference>',
      '<ram:InvoiceCurrencyCode>',
      'SpecifiedTradeSettlementPaymentMeans>',
      '<ram:CalculatedAmount>',
      '<ram:BillingSpecifiedPeriod>',
      '<ram:SpecifiedTradePaymentTerms>',
      'SpecifiedTradeSettlementHeaderMonetarySummation>',
    );
  });

  it('uses the plain EN 16931 guideline without a business process', () => {
    const x = toCii(inv, { guideline: 'en16931' });
    expect(x).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
    expect(x).not.toContain('BusinessProcess');
    expect(x).not.toContain('xrechnung');
  });

  it('writes parties, tax registrations and payment means', () => {
    const x = toCii(inv);
    expect(x).toContain('<ram:ID schemeID="VA">DE123456789</ram:ID>');
    expect(x).toContain('<ram:URIID schemeID="EM">kai@example.com</ram:URIID>');
    expect(x).toContain('<ram:IBANID>DE89370400440532013000</ram:IBANID>');
    expect(x).toContain('<ram:BICID>COBADEFFXXX</ram:BICID>');
    expect(toCii(sb)).toContain('<ram:ID schemeID="FC">12/345/67890</ram:ID>');
  });

  it('handles credit notes: preceding invoice, code 1, refund text', () => {
    const x = toCii(cn);
    expect(x).toContain('<ram:TypeCode>381</ram:TypeCode>');
    expect(x).toContain('<ram:IssuerAssignedID>RE-2026-0001</ram:IssuerAssignedID>');
    expect(x).toContain('<ram:TypeCode>1</ram:TypeCode>');
    expect(x).toContain(
      '<ram:Description>Credit note: the seller refunds the amount or offsets it against open invoices.</ram:Description>',
    );
    expect(x).not.toContain('DueDateDateTime');
  });

  it('writes exemption reason and code', () => {
    expect(toCii(rc)).toContain('<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>');
    expect(toCii(sb)).toContain(
      '<ram:ExemptionReason>Kleinunternehmer gemäß § 19 UStG</ram:ExemptionReason>',
    );
  });

  it('writes the delivery event only with a delivery date', () => {
    expect(toCii(inv)).toContain('<ram:ApplicableHeaderTradeDelivery/>');
    expect(toCii({ ...inv, deliveryDate: '2026-10-20' })).toContain(
      '<ram:ActualDeliverySupplyChainEvent>',
    );
  });
});

describe('electronicAddress', () => {
  it('reads explicit schemes, e-mails and Leitweg-IDs', () => {
    expect(electronicAddress('0204:04011000-12345-34')).toEqual({
      scheme: '0204',
      id: '04011000-12345-34',
    });
    expect(electronicAddress('EM:a@b.example')).toEqual({ scheme: 'EM', id: 'a@b.example' });
    expect(electronicAddress('a@b.example')).toEqual({ scheme: 'EM', id: 'a@b.example' });
    expect(electronicAddress('04011000-12345-34')).toEqual({
      scheme: '0204',
      id: '04011000-12345-34',
    });
    expect(electronicAddress('991-01234-44')).toEqual({ scheme: '0204', id: '991-01234-44' });
    expect(electronicAddress('whatever')).toBeNull();
  });

  it('falls back from explicit address to contact e-mail (seller) and Leitweg-ID (buyer)', () => {
    const base: En16931Invoice = {
      ...inv,
      seller: { ...inv.seller, electronicAddress: undefined },
      buyer: { ...inv.buyer, electronicAddress: undefined },
      buyerReference: '04011000-12345-34',
    };
    const x = toUbl(base);
    expect(x).toContain('<cbc:EndpointID schemeID="EM">kai@example.com</cbc:EndpointID>');
    expect(x).toContain('<cbc:EndpointID schemeID="0204">04011000-12345-34</cbc:EndpointID>');
    expect(xrechnungGaps(base)).toEqual([]);
  });
});

describe('xrechnungGaps', () => {
  it('is empty for the golden fixtures', () => {
    for (const e of [inv, rc, sb, cn]) expect(xrechnungGaps(e)).toEqual([]);
  });

  it('reports what RE-2026-0001 lacks as it stands', () => {
    const parsed = parseYaml(
      loadFixtureRepo().get('.kh/business/invoices/2026/RE-2026-0001.yaml') ?? '',
    );
    if (!parsed.ok) throw new Error('fixture');
    const r = validateIssued(parsed.value);
    if (!r.ok) throw new Error('fixture');
    const issued: Issued = r.value;
    const gaps = xrechnungGaps(toEn16931(issued));
    expect(gaps.join('\n')).toMatch(/BT-10/);
    expect(gaps.join('\n')).toMatch(/phone/);
    expect(gaps.join('\n')).toMatch(/BT-49/);
    expect(gaps.join('\n')).not.toMatch(/BT-34/);
  });

  it('reports a seller with neither VAT id nor tax number (BR-CO-26)', () => {
    const e = { ...sb, seller: { ...sb.seller, taxNumber: undefined } };
    expect(xrechnungGaps(e).join('\n')).toMatch(/BR-CO-26/);
  });

  it('reports an E category without exemption reason', () => {
    const e = { ...sb, vatBreakdown: sb.vatBreakdown.map(({ exemptionReason: _r, ...b }) => b) };
    expect(xrechnungGaps(e).join('\n')).toMatch(/exemption reason/);
  });
});
