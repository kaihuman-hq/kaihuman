import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import { jurisdictionFor } from './jurisdiction.js';
import type { BusinessProfile, Client, Draft, Issued } from './records.js';
import { computeTotals } from './totals.js';
import { validateClient, validateDraft, validateIssued, validateProfile } from './validate.js';
import { parseYaml } from './yaml.js';

const load = <T>(path: string, validate: (raw: unknown) => { ok: boolean; value?: T }): T => {
  const text = loadFixtureRepo().get(path);
  if (text === undefined) throw new Error(`missing fixture ${path}`);
  const parsed = parseYaml(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const result = validate(parsed.value);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value as T;
};

const root = '.kh/business';
const profile: BusinessProfile = load(`${root}/business.yaml`, validateProfile);
const client: Client = load(`${root}/clients/acme-gmbh/client.yaml`, (r) =>
  validateClient(r, 'acme-gmbh'),
);
const invoiceDraft: Draft = load(`${root}/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml`, validateDraft);
const issued: Issued = load(`${root}/invoices/2026/RE-2026-0001.yaml`, validateIssued);
const line = invoiceDraft.lines[0] as Draft['lines'][number];
const de = jurisdictionFor('de');
const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

describe('de', () => {
  it('has 8 years of retention and accepts the fixture draft', () => {
    expect(de.retentionYears).toBe(8);
    expect(de.checkIssue(invoiceDraft, profile, client)).toEqual([]);
  });

  it('stored totals of the fixture invoice equal the computed ones', () => {
    expect(computeTotals(issued.lines, de.exemptionReasons(profile))).toEqual(issued.totals);
  });

  it('needs a VAT id or tax number on the profile', () => {
    const bare = { ...profile, vat_id: undefined, tax_number: undefined };
    expect(paths(de.checkIssue(invoiceDraft, bare, client))).toContain('profile.vat_id');
    expect(de.checkIssue(invoiceDraft, { ...bare, tax_number: '12/345/67890' }, client)).toEqual(
      [],
    );
  });

  it('needs buyer name and full address', () => {
    const bad = { ...client, name: '', address: { ...client.address, city: '' } };
    expect(paths(de.checkIssue(invoiceDraft, profile, bad))).toEqual([
      'client.name',
      'client.address',
    ]);
  });

  it('refuses E, K, O and Z on regular invoices and credit notes, not on offers', () => {
    for (const vat_category of ['E', 'K', 'O', 'Z'] as const) {
      const lines = [line, { ...line, vat_category, vat_rate: '0' }];
      for (const kind of ['invoice', 'credit-note'] as const) {
        const found = de.checkIssue({ ...invoiceDraft, kind, lines }, profile, client);
        expect(found, `${kind} ${vat_category}`).toEqual([
          expect.objectContaining({
            path: 'lines[1].vat_category',
            message: expect.stringContaining('§ 14 Abs. 4 Nr. 8 UStG'),
          }),
        ]);
      }
      const offer: Draft = { ...invoiceDraft, kind: 'offer', valid_until: '2026-12-01', lines };
      expect(de.checkIssue(offer, profile, client)).toEqual([]);
    }
  });

  it('keeps E allowed under small-business', () => {
    const small = { ...profile, vat_regime: 'small-business' as const };
    const lines = [{ ...line, vat_category: 'E' as const, vat_rate: '0' }];
    expect(de.checkIssue({ ...invoiceDraft, lines }, small, client)).toEqual([]);
  });

  it('needs a service period or date', () => {
    const doc = { ...invoiceDraft, service_period: undefined, service_date: undefined };
    expect(de.checkIssue(doc, profile, client)).toContainEqual(
      expect.objectContaining({ path: 'service_period' }),
    );
    expect(de.checkIssue({ ...doc, service_date: '2026-10-01' }, profile, client)).toEqual([]);
  });

  it('small-business needs E lines at rate 0 and adds the § 19 note', () => {
    const small = { ...profile, vat_regime: 'small-business' as const };
    expect(paths(de.checkIssue(invoiceDraft, small, client))).toContain('lines[0].vat_category');
    const exempt = {
      ...invoiceDraft,
      lines: [{ ...line, vat_category: 'E' as const, vat_rate: '0' }],
    };
    expect(de.checkIssue(exempt, small, client)).toEqual([]);
    expect(de.legalNotes(invoiceDraft, small)).toContain(
      'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    );
    expect(de.legalNotes(invoiceDraft, profile)).toEqual([]);
    expect(de.exemptionReasons(small).E).toBe('Kleinunternehmer gemäß § 19 UStG');
    expect(de.exemptionReasons(profile).E).toBeUndefined();
  });

  it('reverse charge needs both VAT ids and adds its note', () => {
    const ae = {
      ...invoiceDraft,
      lines: [{ ...line, vat_category: 'AE' as const, vat_rate: '0' }],
    };
    expect(de.checkIssue(ae, profile, client)).toEqual([]);
    expect(de.checkIssue(ae, profile, { ...client, vat_id: undefined })).toContainEqual(
      expect.objectContaining({ path: 'client.vat_id' }),
    );
    expect(
      paths(de.checkIssue(ae, { ...profile, vat_id: undefined, tax_number: 'x' }, client)),
    ).toEqual(['profile.vat_id']);
    expect(de.legalNotes(ae, profile)).toEqual([
      'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).',
    ]);
    expect(de.exemptionReasons(profile).AE).toBe(
      'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)',
    );
  });

  it('S lines need a rate above 0', () => {
    const zero = { ...invoiceDraft, lines: [{ ...line, vat_rate: '0' }] };
    expect(paths(de.checkIssue(zero, profile, client))).toEqual(['lines[0].vat_rate']);
  });

  it('offers only check lines, buyer name and address', () => {
    const offer: Draft = { ...invoiceDraft, kind: 'offer', service_period: undefined };
    const bare = { ...profile, vat_id: undefined, tax_number: undefined };
    expect(de.checkIssue(offer, bare, client)).toEqual([]);
    expect(paths(de.checkIssue(offer, bare, { ...client, name: '' }))).toEqual(['client.name']);
  });
});

describe('generic', () => {
  const generic = jurisdictionFor('generic');
  it('checks nothing and adds no notes', () => {
    const bare = { ...profile, vat_id: undefined, tax_number: undefined };
    expect(generic.checkIssue(invoiceDraft, bare, client)).toEqual([]);
    expect(generic.legalNotes(invoiceDraft, { ...profile, vat_regime: 'small-business' })).toEqual(
      [],
    );
    expect(generic.exemptionReasons(profile)).toEqual({});
    expect(generic.retentionYears).toBe(10);
  });
});
