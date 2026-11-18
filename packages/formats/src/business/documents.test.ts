import { describe, expect, it } from 'vitest';
import {
  companyFromProfile,
  imageRefs,
  parseDocumentFile,
  partyFromClient,
  resolveDocument,
  resolveRepoPath,
  setProfilePrint,
} from './documents.js';
import { asSlug } from './ids.js';
import { BUSINESS_ROOT, classifyBusinessPath } from './paths.js';
import type { BusinessProfile, Client } from './records.js';
import { loadBusinessRepo } from './repo.js';
import { validateProfile } from './validate.js';

const profile: BusinessProfile = {
  name: 'Erika Muster',
  address: { street: 'Musterstraße 1', postcode: '12345', city: 'Musterstadt', country: 'DE' },
  vat_id: 'DE123456789',
  contact: { name: 'Erika Muster', email: 'erika@example.com', phone: '+49 30 1234567' },
  bank: { iban: 'DE02120300000000202051', bic: 'BYLADEM1001' },
  jurisdiction: 'de',
  vat_regime: 'regular',
  currency: 'EUR',
  language: 'de',
  payment_terms_days: 14,
  default_vat_rate: '19',
  print: {
    letterhead: 'din5008-b',
    paper: 'A4',
    accent: '#0b6cf0',
    font: 'Inter',
    website: 'example.com',
    bank_name: 'Musterbank',
  },
};

const client: Client = {
  slug: asSlug('muster-ag') as NonNullable<ReturnType<typeof asSlug>>,
  name: 'Muster AG',
  address: { street: 'Hauptstraße 1', postcode: '70173', city: 'Stuttgart', country: 'DE' },
  contacts: [{ name: 'Herr Max Muster' }],
  stage: 'active',
};

describe('companyFromProfile', () => {
  it('maps the profile to what the reference company.yaml held', () => {
    expect(companyFromProfile(profile)).toEqual({
      locale: 'de-DE',
      currency: 'EUR',
      paper: 'A4',
      letterhead: 'din5008-b',
      sender: {
        name: 'Erika Muster',
        address: ['Musterstraße 1', '12345 Musterstadt'],
        country: 'DE',
        email: 'erika@example.com',
        phone: '+49 30 1234567',
        website: 'example.com',
        vatId: 'DE123456789',
      },
      bank: { name: 'Musterbank', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001' },
      theme: { accent: '#0b6cf0', font: 'Inter' },
    });
  });

  it('leaves out unset print settings and marks the small-business regime', () => {
    const { print: _, ...plain } = profile;
    const c = companyFromProfile({ ...plain, vat_regime: 'small-business' });
    expect(c).not.toHaveProperty('theme');
    expect(c).not.toHaveProperty('letterhead');
    expect(c.smallBusiness).toBe(true);
    expect(c.bank).toEqual({ iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001' });
  });
});

describe('profile print settings', () => {
  it('validates them with field names', () => {
    const r = validateProfile({
      ...profile,
      print: { accent: 'blue', letterhead: 'x', logo: '../x' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.path).sort()).toEqual([
      'print.accent',
      'print.letterhead',
      'print.logo',
    ]);
  });

  it('accepts the full set', () => {
    expect(
      validateProfile({ ...profile, print: { ...profile.print, logo: 'assets/logo.svg' } }).ok,
    ).toBe(true);
  });

  it('setProfilePrint keeps comments and removes the key when empty', () => {
    const text = '# mine\nname: X # keep\nprint:\n  font: Inter\n';
    const set = setProfilePrint(text, { accent: '#123456', website: '' });
    expect(set).toEqual({
      ok: true,
      value: '# mine\nname: X # keep\nprint:\n  accent: "#123456"\n',
    });
    expect(setProfilePrint(text, {})).toEqual({ ok: true, value: '# mine\nname: X # keep\n' });
  });
});

describe('parseDocumentFile', () => {
  it('splits frontmatter and body', () => {
    const r = parseDocumentFile('---\nsubject: Hi\n---\n\nBody\n---\nmore');
    expect(r).toEqual({ ok: true, value: { data: { subject: 'Hi' }, body: '\nBody\n---\nmore' } });
  });

  it('reports a missing frontmatter and YAML errors with file lines', () => {
    expect(parseDocumentFile('Body only').ok).toBe(false);
    const r = parseDocumentFile('---\na: 1\na: 2\n---\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.line).toBe(3);
  });
});

describe('resolveDocument', () => {
  const doc = (data: Record<string, unknown>) => ({ data, body: 'B' });

  it('resolves a client slug from clients/ and merges over the company', () => {
    const r = resolveDocument(
      doc({ template: 'offer-whole-product', client: 'muster-ag', theme: { accent: '#000' } }),
      profile,
      [client],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.template).toBe('offer-whole-product');
    expect(r.value.data.client).toEqual({
      name: 'Muster AG',
      contact: 'Herr Max Muster',
      address: ['Hauptstraße 1', '70173 Stuttgart'],
      country: 'DE',
    });
    // Mappings merge (font kept), the document wins.
    expect(r.value.data.theme).toEqual({ accent: '#000', font: 'Inter' });
    expect(r.value.data).not.toHaveProperty('template');
  });

  it('keeps an inline client and defaults the template to offer', () => {
    const inline = { name: 'X', address: ['a'] };
    const r = resolveDocument(doc({ client: inline }), profile, []);
    expect(r.ok && r.value.template).toBe('offer');
    expect(r.ok && r.value.data.client).toEqual(inline);
  });

  it('names the fields it cannot resolve', () => {
    const r = resolveDocument(doc({ template: './mine.mjs', client: 'nobody' }), profile, [client]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toEqual(['template', 'client']);
    const missing = resolveDocument(doc({}), profile, []);
    expect(!missing.ok && missing.issues[0]?.path).toBe('client');
  });

  it('partyFromClient omits empty optional fields', () => {
    expect(partyFromClient({ ...client, contacts: [] })).not.toHaveProperty('contact');
  });
});

describe('images and paths', () => {
  it('finds relative image references only', () => {
    expect(
      imageRefs(
        '![D](../assets/diagram.svg) ![x](https://e.x/a.png) <img src="logo.png"> ![d](data:image/png;base64,AA)',
      ),
    ).toEqual(['../assets/diagram.svg', 'logo.png']);
  });

  it('resolves relative to documents/ and refuses to leave the repository', () => {
    expect(resolveRepoPath('../assets/diagram.svg')).toBe(`${BUSINESS_ROOT}/assets/diagram.svg`);
    expect(resolveRepoPath('img/a%20b.png')).toBe(`${BUSINESS_ROOT}/documents/img/a b.png`);
    expect(resolveRepoPath('../../../../x.png')).toBeNull();
  });

  it('classifies documents and assets, and the repo lists documents', () => {
    expect(classifyBusinessPath(`${BUSINESS_ROOT}/documents/offer-muster.md`)).toEqual({
      kind: 'document',
      slug: 'offer-muster',
    });
    expect(classifyBusinessPath(`${BUSINESS_ROOT}/assets/diagram.svg`)).toEqual({ kind: 'asset' });
    expect(classifyBusinessPath(`${BUSINESS_ROOT}/documents/img/a.PNG`)).toEqual({ kind: 'asset' });
    expect(classifyBusinessPath(`${BUSINESS_ROOT}/documents/Bad Name.md`)).toEqual({
      kind: 'unknown',
    });
    const repo = loadBusinessRepo(
      new Map([
        [`${BUSINESS_ROOT}/documents/b-doc.md`, '---\n---\n'],
        [`${BUSINESS_ROOT}/documents/a-doc.md`, '---\n---\n'],
      ]),
      [`${BUSINESS_ROOT}/assets/logo.svg`],
    );
    expect(repo.documents).toEqual([
      { slug: 'a-doc', path: `${BUSINESS_ROOT}/documents/a-doc.md` },
      { slug: 'b-doc', path: `${BUSINESS_ROOT}/documents/b-doc.md` },
    ]);
    expect(repo.findings.filter((f) => !f.file.endsWith('business.yaml'))).toEqual([]);
  });
});
