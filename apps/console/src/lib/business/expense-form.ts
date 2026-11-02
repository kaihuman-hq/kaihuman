import {
  ATTACHMENT_MAX_BYTES,
  type BusinessProfile,
  type Expense,
  formatMinor,
  RECEIPT_EXTENSIONS,
  type Result,
  ulid,
  validateExpense,
} from '@kaihuman/formats/business';
import { parseMoney } from './client-form';
import { isRealDate } from './dates';

export const EXPENSE_CATEGORIES = [
  'Software',
  'Hardware',
  'Travel',
  'Office',
  'Phone & internet',
  'Training',
  'Professional fees',
  'Bank fees',
  'Other',
] as const;

export type ExpenseForm = {
  /** Fixed per page visit, so a failed save and a retry write the same files. */
  id: string;
  date: string;
  supplier: string;
  description: string;
  category: string;
  net: string;
  vatRate: string;
  vat: string;
  /** Once the user has typed a VAT it is no longer overwritten by the net × rate suggestion. */
  vatTouched: boolean;
  client: string;
  project: string;
  /** The stored receipt's file name (`<id>.<ext>`), or what a newly chosen file will be called. */
  receipt: string;
};

export type ExpenseField = Exclude<keyof ExpenseForm, 'id' | 'vatTouched'>;
const FIELDS: readonly ExpenseField[] = [
  'date',
  'supplier',
  'description',
  'category',
  'net',
  'vatRate',
  'vat',
  'client',
  'project',
  'receipt',
];

const MONEY_HINT = 'Enter an amount like 12 or 12.50.';

export const emptyExpenseForm = (
  profile: Pick<BusinessProfile, 'default_vat_rate'> | null | undefined,
  today: string,
): ExpenseForm => ({
  id: ulid(),
  date: today,
  supplier: '',
  description: '',
  category: '',
  net: '',
  vatRate: profile?.default_vat_rate ?? '19',
  vat: '',
  vatTouched: false,
  client: '',
  project: '',
  receipt: '',
});

export const expenseFormFromExpense = (e: Expense, currency: string): ExpenseForm => ({
  id: e.id,
  date: e.date,
  supplier: e.supplier,
  description: e.description,
  category: e.category,
  net: formatMinor(e.net, currency),
  vatRate: e.vat_rate,
  vat: formatMinor(e.vat, currency),
  vatTouched: true,
  client: e.client ?? '',
  project: e.project ?? '',
  receipt: e.receipt ?? '',
});

/** `net × rate / 100`, rounded half up, in exact integer arithmetic; null for a rate that is not a decimal. */
export function suggestVat(net: number, rate: string): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  const numerator = BigInt(net) * BigInt(`${m[1]}${frac}`);
  const denominator = 100n * 10n ** BigInt(frac.length);
  return Number((2n * numerator + denominator) / (2n * denominator));
}

/** Fills the VAT from net and rate unless the user has typed one. */
export function withSuggestedVat(form: ExpenseForm, currency: string): ExpenseForm {
  if (form.vatTouched) return form;
  const net = parseMoney(form.net.trim());
  const vat = net === null ? null : suggestVat(net, form.vatRate);
  return { ...form, vat: vat === null ? '' : formatMinor(vat, currency) };
}

const text = (s: string) => s.trim();

/** Net + VAT in minor units while both parse (VAT empty means the suggestion), else null. */
export function grossOf(form: ExpenseForm): number | null {
  const net = parseMoney(text(form.net));
  if (net === null) return null;
  const vat =
    text(form.vat) === '' ? suggestVat(net, text(form.vatRate)) : parseMoney(text(form.vat));
  return vat === null ? null : net + vat;
}

/**
 * Validates the form into an expense. Gross is net + VAT and never typed. An empty VAT means the
 * suggestion, so a form that was not touched still saves.
 */
export function expenseFromForm(form: ExpenseForm): Result<Expense> {
  const issues: { path: string; message: string }[] = [];
  const net = parseMoney(text(form.net));
  if (net === null) issues.push({ path: 'net', message: `Not an amount. ${MONEY_HINT}` });
  let vat: number | null = null;
  if (text(form.vat) === '') {
    vat = net === null ? null : suggestVat(net, text(form.vatRate));
    if (net !== null && vat === null) {
      issues.push({ path: 'vat_rate', message: 'Enter a rate like 19 or 7.5.' });
    }
  } else {
    vat = parseMoney(text(form.vat));
    if (vat === null) issues.push({ path: 'vat', message: `Not an amount. ${MONEY_HINT}` });
  }
  if (!isRealDate(form.date)) {
    issues.push({ path: 'date', message: 'Enter a date as YYYY-MM-DD.' });
  }
  if (text(form.supplier) === '') issues.push({ path: 'supplier', message: 'Enter the supplier.' });
  if (text(form.description) === '') {
    issues.push({ path: 'description', message: 'Enter a description.' });
  }
  if (text(form.category) === '') issues.push({ path: 'category', message: 'Enter a category.' });
  if (!/^\d+(\.\d+)?$/.test(text(form.vatRate)) && !issues.some((i) => i.path === 'vat_rate')) {
    issues.push({ path: 'vat_rate', message: 'Enter a rate like 19 or 7.5.' });
  }
  if (issues.length > 0 || net === null || vat === null) return { ok: false, issues };
  return validateExpense({
    id: form.id,
    date: form.date,
    supplier: text(form.supplier),
    description: text(form.description),
    category: text(form.category),
    net,
    vat,
    gross: net + vat,
    vat_rate: text(form.vatRate),
    ...(text(form.client) ? { client: text(form.client) } : {}),
    ...(text(form.project) ? { project: text(form.project) } : {}),
    ...(form.receipt ? { receipt: form.receipt } : {}),
  });
}

/** First message per form field; record paths (`vat_rate`) map to their form field. */
export function expenseFieldErrors(result: Result<unknown>): Partial<Record<ExpenseField, string>> {
  const errors: Partial<Record<ExpenseField, string>> = {};
  if (result.ok) return errors;
  for (const issue of result.issues) {
    const path =
      issue.path === 'vat_rate' ? 'vatRate' : issue.path === 'gross' ? 'vat' : issue.path;
    const field = FIELDS.find((f) => f === path);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/**
 * Size and type of a chosen file, before any network call. The messages are the ones
 * `saveExpense` refuses with, so the form and the write agree.
 */
export function checkReceiptFile(file: { name: string; size: number }): Result<{ ext: string }> {
  const refuse = (message: string) => ({
    ok: false as const,
    issues: [{ path: 'receipt', message }],
  });
  if (file.size > ATTACHMENT_MAX_BYTES) return refuse('Receipts can be up to 10 MB.');
  const dot = file.name.lastIndexOf('.');
  const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (!(RECEIPT_EXTENSIONS as readonly string[]).includes(ext)) {
    return refuse('Receipts must be PDF, JPG, PNG, WEBP or HEIC.');
  }
  return { ok: true, value: { ext } };
}
