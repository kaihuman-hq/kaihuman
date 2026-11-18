import { createFormatter, labelsFor } from '@getnarro/pdf';
import type { BusinessProfile, Client, Slug } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import { renderBusinessDocument } from './index';
import {
  DEFAULT_WORDING,
  offerWholeProduct,
  totalsLines,
  withSummary,
} from './offer-whole-product';

const profile: BusinessProfile = {
  name: 'Erika Muster',
  address: { street: 'Musterstraße 1', postcode: '12345', city: 'Musterstadt', country: 'DE' },
  contact: { name: 'Erika Muster', email: 'erika@example.com' },
  bank: { iban: 'DE02120300000000202051' },
  jurisdiction: 'de',
  vat_regime: 'regular',
  currency: 'EUR',
  language: 'de',
  payment_terms_days: 14,
  default_vat_rate: '19',
};
const clients: Client[] = [
  {
    slug: 'muster-ag' as Slug,
    name: 'Muster AG',
    address: { street: 'Hauptstraße 1', postcode: '70173', city: 'Stuttgart', country: 'DE' },
    contacts: [{ name: 'Herr Max Muster' }],
    stage: 'active',
  },
];

// The item prices of the anonymised sample offer (module list, two credits).
const PRICES = [95000, 20000, 20000, 50000, 0, 45000, 35000, 10000, 30000, 20000, 0, 0];
const items = [
  ...PRICES.map(
    (price, i) =>
      `  - { description: Modul ${i + 1}, qty: 1, unit: Lizenz, price: ${price}, vat: 19 }`,
  ),
  '  - { description: Vorteil Komplettpaket, qty: 1, unit: Pauschale, price: -75000, vat: 19 }',
  '  - { description: Nachlass Rahmenvertrag, qty: 1, unit: Pauschale, price: -200000, vat: 19 }',
].join('\n');

const sample = (extra = '') => `---
template: offer-whole-product
date: 2026-11-12
acceptance: true
client: muster-ag
subject: Angebot – Produkt X, Komplettpaket
items:
${items}
${extra}---

Sehr geehrter Herr Muster,

---

## Teil 1: Überblick

| Modul | Einzelpreis |
|---|---:|
| Core | 95.000 € |

---

## Teil 2: Im Detail

<!-- items -->

## 5. Lieferumfang
`;

const render = (text: string) =>
  renderBusinessDocument(
    text,
    profile,
    clients,
    async () => null,
    () => '',
  );

describe('offer-whole-product', () => {
  it('ladders the sample: 325.000 − 75.000 − 200.000 = 50.000 €', async () => {
    const parsed = offerWholeProduct.schema.safeParse({
      date: '2026-11-12',
      client: { name: 'X', address: ['a'] },
      sender: { name: 'S', address: ['b'] },
      items: [...PRICES, -75000, -200000].map((price, i) => ({
        description: `I${i}`,
        qty: 1,
        price,
        vat: 19,
      })),
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const lines = totalsLines({
      data: parsed.data,
      totals: { netCents: 0, discountCents: 0, vatCents: 0, grossCents: 0, lines: [], groups: [] },
      fmt: createFormatter('de-DE', 'EUR'),
      labels: labelsFor('de-DE'),
    });
    expect(lines).toEqual([
      { kind: 'first', label: 'Summe der Einzelpreise', cents: 32500000 },
      { kind: 'credit', label: 'I12', cents: -7500000 },
      { kind: 'step', label: 'Komplettpreis (ohne Rahmenvertrag)', cents: 25000000 },
      { kind: 'credit', label: 'I13', cents: -20000000 },
      { kind: 'grand', label: 'Ihr Preis mit Rahmenvertrag (netto)', cents: 5000000 },
    ]);
  });

  it('renders the sample: no number or validity, credits unnumbered, summary and page breaks', async () => {
    const r = await render(sample());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { html, title } = r.value;
    expect(title).toBe('Angebot – Produkt X, Komplettpaket');
    expect(html).toContain('325.000,00');
    expect(html).toContain('−75.000,00');
    expect(html).toContain('50.000,00');
    expect(html).toContain('zzgl. gesetzlicher USt.');
    expect(html).not.toContain('Gültig bis');
    expect(html).not.toContain('Angebotsnummer');
    // Twelve numbered items, the credits are ladder rows.
    expect(html.match(/<tr class="item"/g)).toHaveLength(12);
    expect(html).toMatch(/<div class="summary"><h2>Teil 1: Überblick<\/h2>[\s\S]*?<\/div><hr/);
    expect(html).toContain('.prose hr { border: 0; height: 0; margin: 0; break-after: page; }');
    expect(html).toContain('.items { break-inside: avoid; }');
  });

  it('takes wording and the summary heading from the frontmatter', async () => {
    const r = await render(
      sample(
        'summaryHeading: Übersicht\nlabels:\n  steps: [Paketpreis]\n  price: Endpreis\n  vatNote: plus VAT\n',
      ).replace('Teil 1: Überblick', 'Übersicht'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.html).toContain('Paketpreis');
    expect(r.value.html).toContain('Endpreis');
    expect(r.value.html).toContain('plus VAT');
    expect(r.value.html).toContain('<div class="summary"><h2>Übersicht</h2>');
  });

  it('reports bad wording with field names', async () => {
    const r = await render(sample('labels:\n  price: 3\n  colour: red\nsummaryHeading: ""\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.path).sort()).toEqual([
        'labels.colour',
        'labels.price',
        'summaryHeading',
      ]);
    }
  });

  it('withSummary leaves html without the heading or a rule alone', () => {
    expect(withSummary('<h2>Teil 10</h2><hr>', 'Teil 1')).toBe('<h2>Teil 10</h2><hr>');
    expect(withSummary('<h2>Teil 1</h2><p>x</p>', 'Teil 1')).toBe('<h2>Teil 1</h2><p>x</p>');
    expect(withSummary('<h2>Teil 1</h2><p>x</p><hr />', 'Teil 1')).toBe(
      '<div class="summary"><h2>Teil 1</h2><p>x</p></div><hr />',
    );
  });

  it('defaults are the German wording of the original template', () => {
    expect(DEFAULT_WORDING.vatNote).toBe('zzgl. gesetzlicher USt.');
  });
});
