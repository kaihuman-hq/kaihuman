/**
 * XRechnung 3.0 (UBL 2.1 and UN/CEFACT CII D16B) from plain EN 16931 data. The serialisers only
 * format the strings `toEn16931` produced and never invent data: what XRechnung demands beyond
 * EN 16931 and the record lacks is reported by `xrechnungGaps`. Element order follows the XSDs.
 */

import type { En16931Invoice, En16931Line, En16931Party } from './en16931.js';
import type { VatCategory } from './records.js';
import { el, renderXml, txt, type XmlNode } from './xml.js';

const XRECHNUNG_ID = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
const EN16931_ID = 'urn:cen.eu:en16931:2017';
const PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

// --- electronic address (BT-34 / BT-49) -------------------------------------------------------

export type ElectronicAddress = { scheme: string; id: string };

const EXPLICIT = /^([0-9]{4}|EM):(.+)$/;
const LEITWEG = /^\d{2,12}(-[A-Za-z0-9]{1,30})?-\d{2}$/;

/** `SCHEME:value` as written, an e-mail as `EM`, a Leitweg-ID as `0204`; anything else is unknown. */
export const electronicAddress = (raw: string): ElectronicAddress | null => {
  const text = raw.trim();
  const explicit = EXPLICIT.exec(text);
  if (explicit?.[1] && explicit[2]) return { scheme: explicit[1], id: explicit[2].trim() };
  if (text.includes('@')) return { scheme: 'EM', id: text };
  if (LEITWEG.test(text)) return { scheme: '0204', id: text };
  return null;
};

const orNull = (raw: string | undefined): ElectronicAddress | null =>
  raw ? electronicAddress(raw) : null;

const sellerAddress = (e: En16931Invoice): ElectronicAddress | null =>
  orNull(e.seller.electronicAddress) ?? orNull(e.seller.contact?.email);

const buyerAddress = (e: En16931Invoice): ElectronicAddress | null => {
  const ref = e.buyerReference?.trim();
  const leitweg = ref && LEITWEG.test(ref) ? { scheme: '0204', id: ref } : null;
  return orNull(e.buyer.electronicAddress) ?? leitweg ?? orNull(e.buyer.contact?.email);
};

// --- gaps -------------------------------------------------------------------------------------

/** What XRechnung requires beyond EN 16931 and the record lacks; empty means complete. */
export const xrechnungGaps = (e: En16931Invoice): string[] => {
  const gaps: string[] = [];
  if (!e.buyerReference)
    gaps.push('Buyer reference (BT-10, BR-DE-15): set buyer_reference or the client Leitweg-ID.');
  if (!e.seller.vatId && !e.seller.taxNumber)
    gaps.push('Seller VAT id or tax number (BT-31 / BT-32, BR-CO-26, BR-DE-16).');
  const c = e.seller.contact;
  if (!c?.name) gaps.push('Seller contact name (BT-41, BR-DE-5).');
  if (!c?.phone) gaps.push('Seller contact phone (BT-42, BR-DE-6).');
  if (!c?.email) gaps.push('Seller contact e-mail (BT-43, BR-DE-7).');
  if (!sellerAddress(e))
    gaps.push('Seller electronic address (BT-34): set electronic_address or a contact e-mail.');
  if (!buyerAddress(e))
    gaps.push(
      'Buyer electronic address (BT-49): set electronic_address, a Leitweg-ID or a contact e-mail.',
    );
  for (const b of e.vatBreakdown) {
    if (b.categoryCode === 'E' && !b.exemptionReason) {
      gaps.push('VAT category E needs an exemption reason (BT-120, BR-E-10).');
    }
  }
  return gaps;
};

// --- shared helpers ---------------------------------------------------------------------------

const NO_VAT: readonly VatCategory[] = ['E', 'AE', 'K', 'O', 'Z'];

/** `"19.00"` → `"19"`, so a line and its breakdown row spell the same rate the same way. */
const canonical = (rate: string): string =>
  rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate;

/** The rate to write, or undefined where none is allowed (category O). */
const rateText = (category: VatCategory, rate: string): string | undefined =>
  category === 'O' ? undefined : NO_VAT.includes(category) ? '0' : canonical(rate);

/** BR-AE-10, BR-IC-10 and BR-O-10 need a reason code or text; these categories have a fixed code. */
const EXEMPTION_CODES: Partial<Record<VatCategory, string>> = {
  AE: 'VATEX-EU-AE',
  K: 'VATEX-EU-IC',
  O: 'VATEX-EU-O',
};

const isZero = (amount: string): boolean => /^0+(\.0+)?$/.test(amount);

/** BT-81 for a document without payment instructions: `1` = instrument not defined (BR-DE-1). */
const paymentCode = (e: En16931Invoice): string => e.paymentMeans?.code ?? '1';

/** BT-20, needed when money is due but no due date says when (BR-CO-25). */
const paymentTermsNote = (e: En16931Invoice): string | undefined => {
  if (e.dueDate || isZero(e.totals.payable)) return undefined;
  return e.typeCode === '381'
    ? 'Credit note: the seller refunds the amount or offsets it against open invoices.'
    : 'Payable on receipt.';
};

const compactDate = (d: string): string => d.replaceAll('-', '');

// --- UBL --------------------------------------------------------------------------------------

const NS_UBL = {
  invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  creditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

const taxScheme = (id: string): XmlNode => el('cac:TaxScheme', undefined, txt('cbc:ID', id));

/**
 * BT-29 for a seller without VAT id: BR-CO-26 accepts only BT-29, BT-30 or BT-31, and a small
 * business often has nothing but its tax number, which does identify it.
 */
const sellerId = (p: En16931Party, seller: boolean): string | undefined =>
  seller && !p.vatId ? p.taxNumber : undefined;

/** `seller` adds what EN 16931 defines only for the seller: BT-29, BT-32 and the contact (BG-6). */
const ublParty = (p: En16931Party, endpoint: ElectronicAddress | null, seller: boolean): XmlNode =>
  el(
    'cac:Party',
    undefined,
    endpoint && txt('cbc:EndpointID', endpoint.id, { schemeID: endpoint.scheme }),
    sellerId(p, seller) &&
      el('cac:PartyIdentification', undefined, txt('cbc:ID', sellerId(p, seller))),
    el(
      'cac:PostalAddress',
      undefined,
      txt('cbc:StreetName', p.address.street),
      txt('cbc:CityName', p.address.city),
      txt('cbc:PostalZone', p.address.postcode),
      el('cac:Country', undefined, txt('cbc:IdentificationCode', p.address.country)),
    ),
    p.vatId && el('cac:PartyTaxScheme', undefined, txt('cbc:CompanyID', p.vatId), taxScheme('VAT')),
    seller &&
      p.taxNumber &&
      el('cac:PartyTaxScheme', undefined, txt('cbc:CompanyID', p.taxNumber), taxScheme('FC')),
    el('cac:PartyLegalEntity', undefined, txt('cbc:RegistrationName', p.name)),
    seller &&
      p.contact &&
      el(
        'cac:Contact',
        undefined,
        txt('cbc:Name', p.contact.name),
        txt('cbc:Telephone', p.contact.phone),
        txt('cbc:ElectronicMail', p.contact.email),
      ),
  );

const ublLine = (l: En16931Line, cur: string, credit: boolean): XmlNode => {
  const qty = credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  return el(
    credit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine',
    undefined,
    txt('cbc:ID', l.id),
    txt(qty, l.quantity, { unitCode: l.unitCode }),
    txt('cbc:LineExtensionAmount', l.netAmount, { currencyID: cur }),
    el(
      'cac:Item',
      undefined,
      txt('cbc:Name', l.name),
      el(
        'cac:ClassifiedTaxCategory',
        undefined,
        txt('cbc:ID', l.vatCategory),
        txt('cbc:Percent', rateText(l.vatCategory, l.vatRate)),
        taxScheme('VAT'),
      ),
    ),
    el('cac:Price', undefined, txt('cbc:PriceAmount', l.unitPrice, { currencyID: cur })),
  );
};

export const toUbl = (e: En16931Invoice): string => {
  const credit = e.typeCode === '381';
  const cur = { currencyID: e.currency };
  const note = paymentTermsNote(e);
  const pm = e.paymentMeans;
  // A CreditNote has no root DueDate; its BT-9 lives in PaymentMeans.
  const means = el(
    'cac:PaymentMeans',
    undefined,
    txt('cbc:PaymentMeansCode', paymentCode(e)),
    credit ? txt('cbc:PaymentDueDate', e.dueDate) : null,
    txt('cbc:PaymentID', pm?.reference),
    pm &&
      el(
        'cac:PayeeFinancialAccount',
        undefined,
        txt('cbc:ID', pm.iban),
        pm.bic && el('cac:FinancialInstitutionBranch', undefined, txt('cbc:ID', pm.bic)),
      ),
  );
  const root = el(
    credit ? 'CreditNote' : 'Invoice',
    undefined,
    txt('cbc:CustomizationID', XRECHNUNG_ID),
    txt('cbc:ProfileID', PROFILE_ID),
    txt('cbc:ID', e.invoiceNumber),
    txt('cbc:IssueDate', e.issueDate),
    credit ? null : txt('cbc:DueDate', e.dueDate),
    txt(credit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', e.typeCode),
    ...e.notes.map((n) => txt('cbc:Note', n)),
    txt('cbc:DocumentCurrencyCode', e.currency),
    txt('cbc:BuyerReference', e.buyerReference),
    e.servicePeriod &&
      el(
        'cac:InvoicePeriod',
        undefined,
        txt('cbc:StartDate', e.servicePeriod.start),
        txt('cbc:EndDate', e.servicePeriod.end),
      ),
    e.precedingInvoice &&
      el(
        'cac:BillingReference',
        undefined,
        el('cac:InvoiceDocumentReference', undefined, txt('cbc:ID', e.precedingInvoice)),
      ),
    el('cac:AccountingSupplierParty', undefined, ublParty(e.seller, sellerAddress(e), true)),
    el('cac:AccountingCustomerParty', undefined, ublParty(e.buyer, buyerAddress(e), false)),
    e.deliveryDate && el('cac:Delivery', undefined, txt('cbc:ActualDeliveryDate', e.deliveryDate)),
    means,
    note && el('cac:PaymentTerms', undefined, txt('cbc:Note', note)),
    el(
      'cac:TaxTotal',
      undefined,
      txt('cbc:TaxAmount', e.totals.tax, cur),
      ...e.vatBreakdown.map((b) =>
        el(
          'cac:TaxSubtotal',
          undefined,
          txt('cbc:TaxableAmount', b.taxableAmount, cur),
          txt('cbc:TaxAmount', b.taxAmount, cur),
          el(
            'cac:TaxCategory',
            undefined,
            txt('cbc:ID', b.categoryCode),
            txt('cbc:Percent', rateText(b.categoryCode, b.rate)),
            txt('cbc:TaxExemptionReasonCode', EXEMPTION_CODES[b.categoryCode]),
            txt('cbc:TaxExemptionReason', b.exemptionReason),
            taxScheme('VAT'),
          ),
        ),
      ),
    ),
    el(
      'cac:LegalMonetaryTotal',
      undefined,
      txt('cbc:LineExtensionAmount', e.totals.lineNetTotal, cur),
      txt('cbc:TaxExclusiveAmount', e.totals.taxExclusive, cur),
      txt('cbc:TaxInclusiveAmount', e.totals.taxInclusive, cur),
      txt('cbc:PayableAmount', e.totals.payable, cur),
    ),
    ...e.lines.map((l) => ublLine(l, e.currency, credit)),
  );
  return renderXml(root, {
    '': credit ? NS_UBL.creditNote : NS_UBL.invoice,
    cac: NS_UBL.cac,
    cbc: NS_UBL.cbc,
  });
};

// --- CII --------------------------------------------------------------------------------------

const NS_CII = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

const ciiDate = (name: string, date: string): XmlNode =>
  el(name, undefined, txt('udt:DateTimeString', compactDate(date), { format: '102' }));

const ciiParty = (
  name: string,
  p: En16931Party,
  endpoint: ElectronicAddress | null,
  seller: boolean,
): XmlNode =>
  el(
    name,
    undefined,
    txt('ram:ID', sellerId(p, seller)),
    txt('ram:Name', p.name),
    seller &&
      p.contact &&
      el(
        'ram:DefinedTradeContact',
        undefined,
        txt('ram:PersonName', p.contact.name),
        p.contact.phone &&
          el(
            'ram:TelephoneUniversalCommunication',
            undefined,
            txt('ram:CompleteNumber', p.contact.phone),
          ),
        p.contact.email &&
          el('ram:EmailURIUniversalCommunication', undefined, txt('ram:URIID', p.contact.email)),
      ),
    el(
      'ram:PostalTradeAddress',
      undefined,
      txt('ram:PostcodeCode', p.address.postcode),
      txt('ram:LineOne', p.address.street),
      txt('ram:CityName', p.address.city),
      txt('ram:CountryID', p.address.country),
    ),
    endpoint &&
      el(
        'ram:URIUniversalCommunication',
        undefined,
        txt('ram:URIID', endpoint.id, { schemeID: endpoint.scheme }),
      ),
    p.vatId &&
      el('ram:SpecifiedTaxRegistration', undefined, txt('ram:ID', p.vatId, { schemeID: 'VA' })),
    seller &&
      p.taxNumber &&
      el('ram:SpecifiedTaxRegistration', undefined, txt('ram:ID', p.taxNumber, { schemeID: 'FC' })),
  );

const ciiLine = (l: En16931Line): XmlNode =>
  el(
    'ram:IncludedSupplyChainTradeLineItem',
    undefined,
    el('ram:AssociatedDocumentLineDocument', undefined, txt('ram:LineID', l.id)),
    el('ram:SpecifiedTradeProduct', undefined, txt('ram:Name', l.name)),
    el(
      'ram:SpecifiedLineTradeAgreement',
      undefined,
      el('ram:NetPriceProductTradePrice', undefined, txt('ram:ChargeAmount', l.unitPrice)),
    ),
    el(
      'ram:SpecifiedLineTradeDelivery',
      undefined,
      txt('ram:BilledQuantity', l.quantity, { unitCode: l.unitCode }),
    ),
    el(
      'ram:SpecifiedLineTradeSettlement',
      undefined,
      el(
        'ram:ApplicableTradeTax',
        undefined,
        txt('ram:TypeCode', 'VAT'),
        txt('ram:CategoryCode', l.vatCategory),
        txt('ram:RateApplicablePercent', rateText(l.vatCategory, l.vatRate)),
      ),
      el(
        'ram:SpecifiedTradeSettlementLineMonetarySummation',
        undefined,
        txt('ram:LineTotalAmount', l.netAmount),
      ),
    ),
  );

export type CiiOptions = { guideline?: 'xrechnung' | 'en16931' };

export const toCii = (e: En16931Invoice, { guideline = 'xrechnung' }: CiiOptions = {}): string => {
  const xr = guideline === 'xrechnung';
  const note = paymentTermsNote(e);
  const pm = e.paymentMeans;
  const root = el(
    'rsm:CrossIndustryInvoice',
    undefined,
    el(
      'rsm:ExchangedDocumentContext',
      undefined,
      xr &&
        el(
          'ram:BusinessProcessSpecifiedDocumentContextParameter',
          undefined,
          txt('ram:ID', PROFILE_ID),
        ),
      el(
        'ram:GuidelineSpecifiedDocumentContextParameter',
        undefined,
        txt('ram:ID', xr ? XRECHNUNG_ID : EN16931_ID),
      ),
    ),
    el(
      'rsm:ExchangedDocument',
      undefined,
      txt('ram:ID', e.invoiceNumber),
      txt('ram:TypeCode', e.typeCode),
      el(
        'ram:IssueDateTime',
        undefined,
        txt('udt:DateTimeString', compactDate(e.issueDate), { format: '102' }),
      ),
      ...e.notes.map((n) => el('ram:IncludedNote', undefined, txt('ram:Content', n))),
    ),
    el(
      'rsm:SupplyChainTradeTransaction',
      undefined,
      ...e.lines.map(ciiLine),
      el(
        'ram:ApplicableHeaderTradeAgreement',
        undefined,
        txt('ram:BuyerReference', e.buyerReference),
        ciiParty('ram:SellerTradeParty', e.seller, sellerAddress(e), true),
        ciiParty('ram:BuyerTradeParty', e.buyer, buyerAddress(e), false),
      ),
      el(
        'ram:ApplicableHeaderTradeDelivery',
        undefined,
        e.deliveryDate &&
          el(
            'ram:ActualDeliverySupplyChainEvent',
            undefined,
            ciiDate('ram:OccurrenceDateTime', e.deliveryDate),
          ),
      ),
      el(
        'ram:ApplicableHeaderTradeSettlement',
        undefined,
        txt('ram:PaymentReference', pm?.reference),
        txt('ram:InvoiceCurrencyCode', e.currency),
        el(
          'ram:SpecifiedTradeSettlementPaymentMeans',
          undefined,
          txt('ram:TypeCode', paymentCode(e)),
          pm && el('ram:PayeePartyCreditorFinancialAccount', undefined, txt('ram:IBANID', pm.iban)),
          pm?.bic &&
            el(
              'ram:PayeeSpecifiedCreditorFinancialInstitution',
              undefined,
              txt('ram:BICID', pm.bic),
            ),
        ),
        ...e.vatBreakdown.map((b) =>
          el(
            'ram:ApplicableTradeTax',
            undefined,
            txt('ram:CalculatedAmount', b.taxAmount),
            txt('ram:TypeCode', 'VAT'),
            txt('ram:ExemptionReason', b.exemptionReason),
            txt('ram:BasisAmount', b.taxableAmount),
            txt('ram:CategoryCode', b.categoryCode),
            txt('ram:ExemptionReasonCode', EXEMPTION_CODES[b.categoryCode]),
            txt('ram:RateApplicablePercent', rateText(b.categoryCode, b.rate)),
          ),
        ),
        e.servicePeriod &&
          el(
            'ram:BillingSpecifiedPeriod',
            undefined,
            ciiDate('ram:StartDateTime', e.servicePeriod.start),
            ciiDate('ram:EndDateTime', e.servicePeriod.end),
          ),
        (e.dueDate || note) &&
          el(
            'ram:SpecifiedTradePaymentTerms',
            undefined,
            e.dueDate ? null : txt('ram:Description', note),
            e.dueDate ? ciiDate('ram:DueDateDateTime', e.dueDate) : null,
          ),
        el(
          'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
          undefined,
          txt('ram:LineTotalAmount', e.totals.lineNetTotal),
          txt('ram:TaxBasisTotalAmount', e.totals.taxExclusive),
          txt('ram:TaxTotalAmount', e.totals.tax, { currencyID: e.currency }),
          txt('ram:GrandTotalAmount', e.totals.taxInclusive),
          txt('ram:DuePayableAmount', e.totals.payable),
        ),
        e.precedingInvoice &&
          el(
            'ram:InvoiceReferencedDocument',
            undefined,
            txt('ram:IssuerAssignedID', e.precedingInvoice),
          ),
      ),
    ),
  );
  return renderXml(root, NS_CII);
};
