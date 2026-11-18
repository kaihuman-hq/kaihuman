/// <reference types="node" />
// The parity check runs narro itself in Node, which reads files.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BusinessProfile, Client, Slug } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import { renderBusinessDocument } from './index';
import { renderDocumentHtml } from './render';

const here = path.dirname(fileURLToPath(import.meta.url));
const noFonts = () => '';
const nothing = async () => null;

const profile: BusinessProfile = {
  name: 'Erika Muster',
  address: { street: 'Musterstraße 1', postcode: '12345', city: 'Musterstadt', country: 'DE' },
  vat_id: 'DE123456789',
  contact: { name: 'Erika Muster', email: 'erika@example.com' },
  bank: { iban: 'DE02120300000000202051', bic: 'BYLADEM1001' },
  jurisdiction: 'de',
  vat_regime: 'regular',
  currency: 'EUR',
  language: 'de',
  payment_terms_days: 14,
  default_vat_rate: '19',
  print: { letterhead: 'din5008-b', accent: '#0b6cf0', bank_name: 'Musterbank' },
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

const offerText = `---
template: offer
number: AN-2026-0001
date: 2026-11-12
validDays: 30
client: muster-ag
items:
  - { description: Beratung, qty: 2, unit: Std., price: 100, vat: 19 }
---
Sehr geehrter Herr Muster,

<!-- items -->

Mit freundlichen Grüßen
`;

describe('renderBusinessDocument', () => {
  it('renders a built-in offer from profile, client slug and content', async () => {
    const r = await renderBusinessDocument(offerText, profile, clients, nothing, noFonts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { html, title, totals } = r.value;
    expect(title).toBe('Angebot AN-2026-0001');
    expect(html).toContain('Muster AG');
    expect(html).toContain('Herr Max Muster');
    expect(html).toContain('DE02 1203 0000 0000 2020 51');
    expect(html).toContain('Musterbank');
    expect(html).toContain('--accent: #0b6cf0');
    expect(totals.grossCents).toBe(23800);
  });

  it('returns every problem with its field, never throws', async () => {
    const bad = offerText
      .replace('number: AN-2026-0001\n', '')
      .replace('Mit freundlichen', '![x](../assets/missing.svg)\n\nMit freundlichen');
    const r = await renderBusinessDocument(bad, profile, clients, nothing, noFonts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.path).sort()).toEqual(['body', 'number']);
    expect(r.issues.find((i) => i.path === 'body')?.message).toContain(
      '.kh/business/assets/missing.svg is not in the repository',
    );
  });

  it('inlines repository images and the profile logo as data: URIs', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const seen: string[] = [];
    const read = async (p: string) => {
      seen.push(p);
      return svg;
    };
    const text = offerText.replace(
      '<!-- items -->',
      '![D](../assets/diagram.svg)\n\n<!-- items -->',
    );
    const r = await renderBusinessDocument(
      text,
      { ...profile, print: { logo: 'assets/logo.svg' } },
      clients,
      read,
      noFonts,
    );
    expect(r.ok).toBe(true);
    expect(seen.sort()).toEqual([
      '.kh/business/assets/diagram.svg',
      '.kh/business/assets/logo.svg',
    ]);
    if (r.ok) expect(r.value.html.match(/src="data:image\/svg\+xml;base64,/g)).toHaveLength(2);
  });
});

describe('parity with narro renderHtml(file)', () => {
  it('produces the same HTML for narro examples/offer.md, fonts aside', async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'narro-')), 'ref.json');
    execFileSync('node', [path.join(here, 'narro-reference.test-helper.mjs'), out], { cwd: here });
    const ref = JSON.parse(readFileSync(out, 'utf8'));
    const logo = Uint8Array.from(atob(ref.logo), (c) => c.charCodeAt(0));
    const r = await renderDocumentHtml({
      doc: { template: 'offer', data: { ...ref.data, logo: 'logo.svg' }, body: ref.body },
      readBytes: async () => logo,
      fontCss: noFonts,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // DOM innerHTML serialises void tags and style attributes slightly differently from
    // react-dom/server; the font CSS differs by design (narro inlines base64).
    const norm = (html: string) =>
      html
        .replace(/^@font-face .*$/gm, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/colspan=/g, 'colSpan=')
        .replace(
          /style="([^"]*)"/g,
          (_m, css: string) => `style="${css.replace(/:\s+/g, ':').replace(/;$/, '')}"`,
        )
        .replace(/\s+/g, ' ')
        .replace(/ ?\/>/g, '>')
        .trim();
    expect(norm(r.value.html)).toBe(norm(ref.html));
  });
});
