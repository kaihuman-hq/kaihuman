import { formatMinor, type Payment, type Result } from '@kaihuman/formats/business';
import { money } from '../../components/business/money';
import { parseMoney } from './client-form';

export type PaymentForm = {
  amount: string;
  date: string;
  method: string;
  ref: string;
};

export type PaymentField = keyof PaymentForm;

/** The amount starts at what is still open, so paying in full is one click; a settled invoice starts empty. */
export const initialPaymentForm = (
  openAmount: number,
  currency: string,
  today: string,
): PaymentForm => ({
  amount: openAmount > 0 ? formatMinor(openAmount, currency) : '',
  date: today,
  method: '',
  ref: '',
});

/**
 * Validates the form into a payment (without id and invoice number). An empty amount means the
 * open amount, as in the prefilled form.
 */
export function paymentFromForm(
  form: PaymentForm,
  openAmount: number,
): Result<Pick<Payment, 'amount' | 'date' | 'method' | 'ref'>> {
  const issues: { path: PaymentField; message: string }[] = [];
  const amountText = form.amount.trim();
  const amount = amountText === '' ? openAmount : parseMoney(amountText);
  if (amount === null)
    issues.push({ path: 'amount', message: 'Enter an amount like 500 or 500.00.' });
  else if (amount < 1) issues.push({ path: 'amount', message: 'The amount must be more than 0.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(Date.parse(form.date))) {
    issues.push({ path: 'date', message: 'Enter a date as YYYY-MM-DD.' });
  }
  if (issues.length > 0 || amount === null) return { ok: false, issues };
  const method = form.method.trim();
  const ref = form.ref.trim();
  return {
    ok: true,
    value: {
      amount,
      date: form.date,
      ...(method ? { method } : {}),
      ...(ref ? { ref } : {}),
    },
  };
}

/** Minor units paid beyond the open amount; 0 when the payment fits. */
export const overpaidBy = (amount: number, openAmount: number): number =>
  Math.max(0, amount - openAmount);

export const overpaymentPrompt = (excess: number, currency: string): string =>
  `This is ${money(excess, currency)} more than the open amount. Record anyway?`;

/** First message per form field. */
export function paymentFieldErrors(result: Result<unknown>): Partial<Record<PaymentField, string>> {
  const errors: Partial<Record<PaymentField, string>> = {};
  if (result.ok) return errors;
  for (const issue of result.issues) {
    const field = issue.path as PaymentField;
    if (['amount', 'date', 'method', 'ref'].includes(field) && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
