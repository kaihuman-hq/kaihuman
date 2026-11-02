import type { Ulid } from '../ids.js';
import type { TextChanges } from '../issue.js';
import { appendJsonl } from '../jsonl.js';
import { formatMinor } from '../money.js';
import { paymentsPath } from '../paths.js';
import { KEY_ORDER, type Payment } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validatePayment } from '../validate.js';
import type { Result } from '../validate-kit.js';

/**
 * `paymentsText` is the current text of the payment date's year file, or `null` when it has none.
 * The year comes from `payment.date`: a late December invoice paid in January lands in the new year.
 */
export const recordPayment = (
  repo: BusinessRepo,
  paymentsText: string | null,
  payment: Omit<Payment, 'id'>,
  id: Ulid,
): Result<{ changes: TextChanges; message: string }> => {
  const invoice = repo.issued.find((i) => i.doc.number === payment.invoice)?.doc;
  // Credit notes reduce what is owed through `corrects`; a payment against one would be counted twice.
  if (!invoice || invoice.kind !== 'invoice') {
    return {
      ok: false,
      issues: [{ path: 'invoice', message: `unknown invoice "${payment.invoice}"` }],
    };
  }
  const checked = validatePayment({ id, ...payment });
  if (!checked.ok) return checked;
  const file = paymentsPath(Number(payment.date.slice(0, 4)));
  const currency = invoice.currency ?? repo.profile?.currency ?? 'EUR';
  return {
    ok: true,
    value: {
      changes: { [file]: appendJsonl(paymentsText ?? '', checked.value, KEY_ORDER.payment) },
      message: `business: payment ${formatMinor(payment.amount, currency)} ${currency} for ${payment.invoice}`,
    },
  };
};
