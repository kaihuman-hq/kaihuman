import { type BusinessProfile, type Result, validateProfile } from '@kaihuman/formats/business';
import { AlreadyEnabledError, PublicRepoError } from './errors';

export type EnableForm = {
  name: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  vatId: string;
  taxNumber: string;
  contactName: string;
  email: string;
  phone: string;
  iban: string;
  bic: string;
  vatRegime: 'regular' | 'small-business';
  paymentTermsDays: string;
  confirmRetention: boolean;
  confirmBranchProtection: boolean;
  confirmAccess: boolean;
};

export const EMPTY_FORM: EnableForm = {
  name: '',
  street: '',
  postcode: '',
  city: '',
  country: 'DE',
  vatId: '',
  taxNumber: '',
  contactName: '',
  email: '',
  phone: '',
  iban: '',
  bic: '',
  vatRegime: 'regular',
  paymentTermsDays: '14',
  confirmRetention: false,
  confirmBranchProtection: false,
  confirmAccess: false,
};

/** An empty optional field is left out of the file instead of written as `""`. */
const optional = <K extends string>(key: K, value: string): { [P in K]?: string } =>
  (value === '' ? {} : { [key]: value }) as { [P in K]?: string };

/**
 * Builds the profile file from the form. No `numbering`: the defaults apply, and changing it
 * once documents are issued would break the series.
 */
export function profileFromForm(form: EnableForm): Result<BusinessProfile> {
  const f = (v: string) => v.trim();
  const country = f(form.country).toUpperCase();
  const terms = f(form.paymentTermsDays);
  const profile = {
    name: f(form.name),
    address: { street: f(form.street), postcode: f(form.postcode), city: f(form.city), country },
    ...optional('vat_id', f(form.vatId)),
    ...optional('tax_number', f(form.taxNumber)),
    contact: {
      name: f(form.contactName),
      email: f(form.email),
      ...optional('phone', f(form.phone)),
    },
    bank: {
      iban: form.iban.replace(/\s+/g, '').toUpperCase(),
      ...optional('bic', f(form.bic)),
    },
    jurisdiction: country === 'DE' ? 'de' : 'generic',
    vat_regime: form.vatRegime,
    currency: 'EUR',
    language: 'de',
    // A non-number stays a string so the validator reports it on this field.
    payment_terms_days: /^\d+$/.test(terms) ? Number(terms) : terms,
    default_vat_rate: '19',
  };
  return validateProfile(profile);
}

const FIELD_OF_PATH: Record<string, keyof EnableForm> = {
  name: 'name',
  'address.street': 'street',
  'address.postcode': 'postcode',
  'address.city': 'city',
  'address.country': 'country',
  vat_id: 'vatId',
  tax_number: 'taxNumber',
  'contact.name': 'contactName',
  'contact.email': 'email',
  'contact.phone': 'phone',
  'bank.iban': 'iban',
  'bank.bic': 'bic',
  vat_regime: 'vatRegime',
  payment_terms_days: 'paymentTermsDays',
};

/** First message per form field. An issue on a path without a field is not shown inline. */
export function fieldErrors(
  result: Result<BusinessProfile>,
): Partial<Record<keyof EnableForm, string>> {
  const errors: Partial<Record<keyof EnableForm, string>> = {};
  if (result.ok) return errors;
  for (const issue of result.issues) {
    const field = FIELD_OF_PATH[issue.path];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export const canSubmit = (form: EnableForm): boolean =>
  form.confirmRetention && form.confirmBranchProtection && form.confirmAccess;

export function enableErrorMessage(e: unknown): string {
  if (e instanceof PublicRepoError) {
    return 'This repository is public. Business data (invoices, client details, share links) needs a private repository. Make it private on GitHub, then try again.';
  }
  if (e instanceof AlreadyEnabledError) return 'Business is already enabled in this repository.';
  return `Setup failed, nothing was written: ${e instanceof Error ? e.message : String(e)}`;
}
