import { parseDecimal } from './money.js';
import type {
  BusinessProfile,
  Client,
  Draft,
  Jurisdiction as JurisdictionCode,
  VatCategory,
} from './records.js';
import type { Issue } from './validate-kit.js';

/** Named `JurisdictionRules` because `Jurisdiction` is already the `'de' | 'generic'` code type. */
export interface JurisdictionRules {
  code: JurisdictionCode;
  retentionYears: number;
  /** Problems that stop a draft from being issued; empty when it can be. */
  checkIssue(doc: Draft, profile: BusinessProfile, client: Client): Issue[];
  legalNotes(doc: Draft, profile: BusinessProfile): string[];
  exemptionReasons(profile: BusinessProfile): Partial<Record<VatCategory, string>>;
}

const issue = (path: string, message: string): Issue => ({ path, message: `${path}: ${message}` });

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === '';

const isZero = (rate: string): boolean => parseDecimal(rate)?.units === 0n;

export const SMALL_BUSINESS_NOTE = 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.';
export const REVERSE_CHARGE_NOTE =
  'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).';

const de: JurisdictionRules = {
  code: 'de',
  retentionYears: 8,
  checkIssue(doc, profile, client) {
    const issues: Issue[] = [];
    if (blank(client.name)) issues.push(issue('client.name', 'the buyer needs a name'));
    const a = client.address;
    if (!a || blank(a.street) || blank(a.postcode) || blank(a.city) || blank(a.country)) {
      issues.push(
        issue('client.address', 'the buyer needs a full address: street, postcode, city, country'),
      );
    }
    if (doc.kind !== 'offer') {
      if (blank(profile.vat_id) && blank(profile.tax_number)) {
        issues.push(issue('profile.vat_id', 'set vat_id or tax_number in business.yaml'));
      }
      if (!doc.service_period && !doc.service_date) {
        issues.push(issue('service_period', 'set service_period or service_date'));
      }
    }
    if (profile.vat_regime === 'small-business') {
      doc.lines.forEach((line, i) => {
        if (line.vat_category !== 'E' || !isZero(line.vat_rate)) {
          issues.push(
            issue(
              `lines[${i}].vat_category`,
              'small-business lines must be category E with rate "0"',
            ),
          );
        }
      });
    }
    if (doc.lines.some((l) => l.vat_category === 'AE')) {
      if (blank(client.vat_id)) {
        issues.push(issue('client.vat_id', 'reverse charge (AE) needs the buyer VAT id'));
      }
      if (blank(profile.vat_id)) {
        issues.push(issue('profile.vat_id', 'reverse charge (AE) needs your VAT id'));
      }
    }
    doc.lines.forEach((line, i) => {
      const rate = parseDecimal(line.vat_rate);
      if (line.vat_category === 'S' && (!rate || rate.units <= 0n)) {
        issues.push(issue(`lines[${i}].vat_rate`, 'category S needs a rate above 0'));
      }
    });
    return issues;
  },
  legalNotes(doc, profile) {
    const notes: string[] = [];
    if (profile.vat_regime === 'small-business') notes.push(SMALL_BUSINESS_NOTE);
    if (doc.lines.some((l) => l.vat_category === 'AE')) notes.push(REVERSE_CHARGE_NOTE);
    return notes;
  },
  exemptionReasons(profile) {
    return {
      AE: 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)',
      ...(profile.vat_regime === 'small-business' ? { E: 'Kleinunternehmer gemäß § 19 UStG' } : {}),
    };
  },
};

const generic: JurisdictionRules = {
  code: 'generic',
  retentionYears: 10,
  checkIssue: () => [],
  legalNotes: () => [],
  exemptionReasons: () => ({}),
};

export const jurisdictionFor = (code: JurisdictionCode): JurisdictionRules =>
  code === 'de' ? de : generic;
