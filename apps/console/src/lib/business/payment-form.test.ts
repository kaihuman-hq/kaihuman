import { describe, expect, it } from 'vitest';
import {
  initialPaymentForm,
  overpaidBy,
  overpaymentPrompt,
  paymentFieldErrors,
  paymentFromForm,
} from './payment-form';

describe('initialPaymentForm', () => {
  it('defaults the amount to the open amount and the date to today', () => {
    expect(initialPaymentForm(100138, 'EUR', '2026-11-10')).toEqual({
      amount: '1001.38',
      date: '2026-11-10',
      method: '',
      ref: '',
    });
  });
  it('leaves the amount empty when nothing is open', () => {
    expect(initialPaymentForm(0, 'EUR', '2026-11-10').amount).toBe('');
  });
});

describe('paymentFromForm', () => {
  const form = { amount: '500', date: '2026-11-10', method: ' transfer ', ref: '' };
  it('parses minor units and trims, leaving empty optionals out', () => {
    expect(paymentFromForm(form, 100138)).toEqual({
      ok: true,
      value: { amount: 50000, date: '2026-11-10', method: 'transfer' },
    });
  });
  it('treats an empty amount as the open amount', () => {
    expect(paymentFromForm({ ...form, amount: ' ' }, 100138)).toMatchObject({
      value: { amount: 100138 },
    });
  });
  it('refuses a day that does not exist', () => {
    expect(paymentFieldErrors(paymentFromForm({ ...form, date: '2026-02-31' }, 100)).date).toBe(
      'Enter a date as YYYY-MM-DD.',
    );
  });
  it('reports field errors and keeps nothing else', () => {
    const r = paymentFromForm({ ...form, amount: '12,345', date: 'soon' }, 100);
    expect(paymentFieldErrors(r)).toEqual({
      amount: 'Enter an amount like 500 or 500.00.',
      date: 'Enter a date as YYYY-MM-DD.',
    });
    expect(paymentFieldErrors(paymentFromForm({ ...form, amount: '0' }, 100)).amount).toContain(
      'more than 0',
    );
  });
});

describe('overpayment', () => {
  it('measures the excess and words the confirm step with real amounts', () => {
    expect(overpaidBy(110000, 100138)).toBe(9862);
    expect(overpaidBy(100138, 100138)).toBe(0);
    expect(overpaidBy(500, 100138)).toBe(0);
    expect(overpaymentPrompt(9862, 'EUR')).toBe(
      'This is 98.62 EUR more than the open amount. Record anyway?',
    );
  });
});
