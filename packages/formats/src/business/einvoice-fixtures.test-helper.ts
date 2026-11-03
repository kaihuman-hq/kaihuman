import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import { jurisdictionFor, REVERSE_CHARGE_NOTE, SMALL_BUSINESS_NOTE } from './jurisdiction.js';
import type { BusinessProfile, Issued, Line, Party } from './records.js';
import { computeTotals } from './totals.js';
import { validateIssued } from './validate.js';
import { parseYaml } from './yaml.js';

export const EINVOICE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/business/einvoice',
);

export const readGolden = (file: string): string | undefined => {
  try {
    return readFileSync(join(EINVOICE_DIR, file), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
};

const base = (): Issued => {
  const parsed = parseYaml(
    loadFixtureRepo().get('.kh/business/invoices/2026/RE-2026-0001.yaml') ?? '',
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const r = validateIssued(parsed.value);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

const profile = (over: Partial<BusinessProfile> = {}): BusinessProfile => ({
  name: 'Kai Mustermann',
  address: { street: 'Musterstrasse 1', postcode: '10115', city: 'Berlin', country: 'DE' },
  contact: { name: 'Kai Mustermann', email: 'kai@example.com', phone: '+49 30 1234567' },
  bank: { iban: 'DE89370400440532013000', bic: 'COBADEFFXXX' },
  jurisdiction: 'de',
  vat_regime: 'regular',
  currency: 'EUR',
  language: 'de',
  payment_terms_days: 14,
  default_vat_rate: '19',
  ...over,
});

const seller = (extra: Partial<Party> = {}): Party => ({
  name: 'Kai Mustermann',
  address: { street: 'Musterstrasse 1', postcode: '10115', city: 'Berlin', country: 'DE' },
  vat_id: 'DE123456789',
  contact: { name: 'Kai Mustermann', email: 'kai@example.com', phone: '+49 30 1234567' },
  electronic_address: 'kai@example.com',
  ...extra,
});

export const EINVOICE_NAMES = [
  'invoice',
  'reverse-charge',
  'small-business',
  'credit-note',
] as const;
export type EinvoiceName = (typeof EINVOICE_NAMES)[number];

export const einvoiceFixtures = (): Record<EinvoiceName, Issued> => {
  const re = base();
  const payment = re.payment;
  if (!payment) throw new Error('RE-2026-0001 has payment');
  const invoice: Issued = {
    ...re,
    buyer_reference: '04011000-12345-34',
    seller: seller(),
    buyer: { ...re.buyer, electronic_address: 'rechnung@acme.example' },
  };

  const rcLines: Line[] = [
    {
      description: 'Software development for Wiener Beispiel GmbH',
      quantity: '10',
      unit: 'HUR',
      unit_price: 9500,
      vat_category: 'AE',
      vat_rate: '0',
    },
  ];
  const rcProfile = profile();
  const reverseCharge: Issued = {
    ...re,
    number: 'RE-2026-0003',
    issue_date: '2026-10-27',
    due_date: '2026-11-10',
    lines: rcLines,
    time_entries: [],
    buyer_reference: 'PO-4711',
    seller: seller(),
    buyer: {
      name: 'Wiener Beispiel GmbH',
      address: { street: 'Ringstrasse 12', postcode: '1010', city: 'Wien', country: 'AT' },
      vat_id: 'ATU12345678',
      electronic_address: 'einkauf@beispiel.example',
    },
    payment: { ...payment, reference: 'RE-2026-0003' },
    totals: computeTotals(rcLines, jurisdictionFor('de').exemptionReasons(rcProfile)),
    legal_notes: [REVERSE_CHARGE_NOTE],
  };

  const sbLines: Line[] = [
    {
      description: 'Consulting',
      quantity: '4.5',
      unit: 'HUR',
      unit_price: 8000,
      vat_category: 'E',
      vat_rate: '0',
    },
    {
      description: 'Workshop & training <on site>',
      quantity: '1',
      unit: 'C62',
      unit_price: 25000,
      vat_category: 'E',
      vat_rate: '0',
    },
  ];
  const sbProfile = profile({ vat_regime: 'small-business' });
  const smallBusiness: Issued = {
    ...re,
    number: 'RE-2026-0004',
    issue_date: '2026-10-28',
    due_date: '2026-11-11',
    lines: sbLines,
    time_entries: [],
    buyer_reference: 'ORD-2026-17',
    seller: seller({ vat_id: undefined, tax_number: '12/345/67890' }),
    buyer: { ...re.buyer, electronic_address: 'rechnung@acme.example' },
    payment: { ...payment, reference: 'RE-2026-0004' },
    totals: computeTotals(sbLines, jurisdictionFor('de').exemptionReasons(sbProfile)),
    legal_notes: [SMALL_BUSINESS_NOTE],
  };
  delete smallBusiness.seller.vat_id;

  const { payment: _p, due_date: _d, ...rest } = invoice;
  const creditNote: Issued = {
    ...rest,
    number: 'RE-2026-0002',
    issue_date: '2026-11-02',
    kind: 'credit-note',
    type_code: 381,
    corrects: invoice.number,
  };

  return {
    invoice,
    'reverse-charge': reverseCharge,
    'small-business': smallBusiness,
    'credit-note': creditNote,
  };
};
