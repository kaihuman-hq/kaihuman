import { describe, expect, it } from 'vitest';
import {
  checkReceiptFile,
  EXPENSE_CATEGORIES,
  emptyExpenseForm,
  expenseFieldErrors,
  expenseFormFromExpense,
  expenseFromForm,
  grossOf,
  suggestVat,
  withSuggestedVat,
} from './expense-form';

const ID = '01M55FJ500NTZ49EKRX27CHPV0';
const form = {
  id: ID,
  date: '2026-10-03',
  supplier: ' Hosting AG ',
  description: 'Server October',
  category: 'Software',
  net: '10.00',
  vatRate: '19',
  vat: '1.90',
  vatTouched: false,
  client: '',
  project: '',
  receipt: '',
};

describe('suggestVat', () => {
  it('rounds half up in minor units', () => {
    expect(suggestVat(1000, '19')).toBe(190);
    expect(suggestVat(1050, '19')).toBe(200); // 199.5
    expect(suggestVat(333, '7')).toBe(23); // 23.31
    expect(suggestVat(1000, '7.5')).toBe(75);
    expect(suggestVat(1000, '0')).toBe(0);
  });
  it('is null for a rate that is not a decimal', () => {
    expect(suggestVat(1000, 'abc')).toBeNull();
    expect(suggestVat(1000, '')).toBeNull();
  });
});

describe('emptyExpenseForm', () => {
  it('starts with today, the profile default rate and a fresh id', () => {
    const f = emptyExpenseForm({ default_vat_rate: '7' } as never, '2026-11-10');
    expect(f).toMatchObject({ date: '2026-11-10', vatRate: '7', net: '', vat: '', receipt: '' });
    expect(f.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it('falls back to 19 without a profile', () => {
    expect(emptyExpenseForm(null, '2026-11-10').vatRate).toBe('19');
  });
});

describe('withSuggestedVat', () => {
  it('fills VAT from net and rate until the user types a VAT', () => {
    expect(withSuggestedVat({ ...form, vat: '', net: '100', vatRate: '19' }, 'EUR').vat).toBe(
      '19.00',
    );
  });
  it('leaves a typed VAT alone', () => {
    expect(withSuggestedVat({ ...form, vatTouched: true, vat: '1.89' }, 'EUR').vat).toBe('1.89');
  });
  it('clears the suggestion when the net is not an amount', () => {
    expect(withSuggestedVat({ ...form, net: 'x' }, 'EUR').vat).toBe('');
  });
});

describe('expenseFromForm', () => {
  it('parses minor units, trims, and computes gross as net + VAT', () => {
    expect(expenseFromForm(form)).toEqual({
      ok: true,
      value: {
        id: ID,
        date: '2026-10-03',
        supplier: 'Hosting AG',
        description: 'Server October',
        category: 'Software',
        net: 1000,
        vat: 190,
        gross: 1190,
        vat_rate: '19',
      },
    });
  });
  it('keeps a VAT the user overrode (receipt rounding)', () => {
    const r = expenseFromForm({ ...form, vat: '1.89', vatTouched: true });
    expect(r.ok && [r.value.vat, r.value.gross]).toEqual([189, 1189]);
  });
  it('uses the suggestion when the VAT is empty', () => {
    const r = expenseFromForm({ ...form, vat: '' });
    expect(r.ok && r.value.vat).toBe(190);
  });
  it('carries client, project and receipt when set', () => {
    const r = expenseFromForm({
      ...form,
      client: 'acme',
      project: 'site',
      receipt: `${ID}.pdf`,
    });
    expect(r.ok && r.value).toMatchObject({
      client: 'acme',
      project: 'site',
      receipt: `${ID}.pdf`,
    });
  });
  it('reports field errors', () => {
    const r = expenseFromForm({
      ...form,
      date: '2026-13-01',
      supplier: ' ',
      net: 'abc',
      vat: '1,9x',
      vatTouched: true,
      vatRate: 'x',
    });
    expect(r.ok).toBe(false);
    const errors = expenseFieldErrors(r);
    expect(Object.keys(errors).sort()).toEqual(['date', 'net', 'supplier', 'vat', 'vatRate']);
    expect(errors.net).toMatch(/amount/);
  });
});

describe('grossOf', () => {
  it('adds net and VAT, or the suggestion when VAT is empty', () => {
    expect(grossOf(form)).toBe(1190);
    expect(grossOf({ ...form, vat: '' })).toBe(1190);
    expect(grossOf({ ...form, vat: '1.89' })).toBe(1189);
  });
  it('is null while an amount is invalid', () => {
    expect(grossOf({ ...form, net: 'x' })).toBeNull();
    expect(grossOf({ ...form, vat: 'x' })).toBeNull();
    expect(grossOf({ ...form, vat: '', vatRate: 'x' })).toBeNull();
  });
});

describe('expenseFormFromExpense', () => {
  it('round-trips through expenseFromForm', () => {
    const expense = {
      id: ID,
      date: '2026-10-03',
      supplier: 'Hosting AG',
      description: 'Server October',
      category: 'hosting',
      net: 1000,
      vat: 189,
      gross: 1189,
      vat_rate: '19',
      receipt: `${ID}.png`,
    } as never;
    const f = expenseFormFromExpense(expense, 'EUR');
    expect(f).toMatchObject({ net: '10.00', vat: '1.89', vatTouched: true });
    expect(expenseFromForm(f)).toEqual({ ok: true, value: expense });
  });
});

describe('checkReceiptFile', () => {
  it('accepts allowed types up to 10 MB, lower-casing the extension', () => {
    expect(checkReceiptFile({ name: 'Scan.JPG', size: 10485760 })).toEqual({
      ok: true,
      value: { ext: 'jpg' },
    });
  });
  it('refuses a file over 10 MB with the formats message', () => {
    const r = checkReceiptFile({ name: 'a.pdf', size: 10485761 });
    expect(!r.ok && r.issues[0]?.message).toBe('Receipts can be up to 10 MB.');
  });
  it('refuses other types with the formats message', () => {
    for (const name of ['a.gif', 'noext', 'a.exe']) {
      const r = checkReceiptFile({ name, size: 10 });
      expect(!r.ok && r.issues[0]?.message).toBe('Receipts must be PDF, JPG, PNG, WEBP or HEIC.');
    }
  });
});

it('offers the fixed categories', () => {
  expect(EXPENSE_CATEGORIES).toContain('Phone & internet');
  expect(EXPENSE_CATEGORIES).toHaveLength(9);
});
