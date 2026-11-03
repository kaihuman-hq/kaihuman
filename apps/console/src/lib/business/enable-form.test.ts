import { describe, expect, it, vi } from 'vitest';

vi.mock('@kaihuman/core', () => ({ githubService: {} }));

const { AlreadyEnabledError, PublicRepoError } = await import('./errors');
const { EMPTY_FORM, canSubmit, enableErrorMessage, fieldErrors, profileFromForm } = await import(
  './enable-form'
);

const filled = {
  ...EMPTY_FORM,
  name: 'Muster GmbH',
  street: 'Weg 1',
  postcode: '10115',
  city: 'Berlin',
  vatId: 'DE123456789',
  contactName: 'Max',
  email: 'max@example.com',
  iban: 'de89 3704 0044 0532 0130 00',
};
const confirmed = {
  ...filled,
  confirmRetention: true,
  confirmBranchProtection: true,
  confirmAccess: true,
};

describe('profileFromForm', () => {
  it('builds a German profile with fixed defaults and a normalised IBAN', () => {
    const p = profileFromForm(filled);
    expect(p.ok && p.value).toMatchObject({
      jurisdiction: 'de',
      currency: 'EUR',
      language: 'de',
      default_vat_rate: '19',
      payment_terms_days: 14,
      bank: { iban: 'DE89370400440532013000' },
    });
    expect(p.ok && 'numbering' in p.value).toBe(false);
  });

  it('drops empty optional fields and trims the rest', () => {
    const p = profileFromForm({ ...filled, name: '  Muster GmbH ', taxNumber: ' ', phone: '' });
    expect(p.ok && p.value.name).toBe('Muster GmbH');
    expect(p.ok && 'tax_number' in p.value).toBe(false);
    expect(p.ok && 'phone' in p.value.contact).toBe(false);
    expect(p.ok && 'bic' in p.value.bank).toBe(false);
  });

  it('writes vat_basis only for cash', () => {
    const accrual = profileFromForm(filled);
    expect(accrual.ok && 'vat_basis' in accrual.value).toBe(false);
    const cash = profileFromForm({ ...filled, vatBasis: 'cash' });
    expect(cash.ok && cash.value.vat_basis).toBe('cash');
  });

  it('uses the generic jurisdiction outside Germany', () => {
    const p = profileFromForm({ ...filled, country: 'AT' });
    expect(p.ok && p.value.jurisdiction).toBe('generic');
  });

  it('rejects a missing email and a non-numeric payment term', () => {
    expect(profileFromForm({ ...filled, email: '' }).ok).toBe(false);
    expect(profileFromForm({ ...filled, paymentTermsDays: 'soon' }).ok).toBe(false);
  });
});

describe('fieldErrors', () => {
  it('maps issue paths to form fields', () => {
    const p = profileFromForm({ ...filled, email: '', iban: 'nope', street: '' });
    expect(p.ok).toBe(false);
    const errors = fieldErrors(p);
    expect(errors.email).toBeTruthy();
    expect(errors.iban).toBeTruthy();
    expect(errors.street).toBeTruthy();
    expect(errors.name).toBeUndefined();
  });

  it('is empty for a valid form', () => {
    expect(fieldErrors(profileFromForm(filled))).toEqual({});
  });
});

describe('canSubmit', () => {
  it('needs all three confirmations', () => {
    expect(canSubmit(filled)).toBe(false);
    expect(canSubmit({ ...confirmed, confirmAccess: false })).toBe(false);
    expect(canSubmit(confirmed)).toBe(true);
  });
});

describe('enableErrorMessage', () => {
  it('explains each failure', () => {
    expect(enableErrorMessage(new PublicRepoError('x'))).toMatch(/^This repository is public/);
    expect(enableErrorMessage(new AlreadyEnabledError('x'))).toBe(
      'Business is already enabled in this repository.',
    );
    expect(enableErrorMessage(new Error('boom'))).toBe('Setup failed, nothing was written: boom');
    expect(enableErrorMessage('str')).toBe('Setup failed, nothing was written: str');
  });
});
