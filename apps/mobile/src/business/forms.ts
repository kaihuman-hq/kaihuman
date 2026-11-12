import { asSlug, type Payment, type Result, type TimeEntry } from '@kaihuman/formats/business';
import { isRealDate } from './dates.js';

// Same accepted shapes as the console's forms, so a habit carries over between devices.

export const HOURS_HINT = 'Use 1.5, 1:30 or 90m.';

/** Minutes for `1.5`, `1,5`, `1:30` or `90m`; `null` for anything else. */
export function parseHours(input: string): number | null {
  const s = input.trim().toLowerCase();
  const clock = s.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const decimal = (text: string | undefined) => Number((text ?? '').replace(',', '.'));
  const mins = s.match(/^(\d+(?:[.,]\d+)?)\s*m(?:in)?$/);
  if (mins) return Math.round(decimal(mins[1]));
  const hrs = s.match(/^(\d+(?:[.,]\d+)?)\s*h?$/);
  if (hrs) return Math.round(decimal(hrs[1]) * 60);
  return null;
}

/** `H:MM` for the hours field, e.g. a stopped timer's prefill. */
export const formatHours = (minutes: number): string =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

export type TimeForm = {
  client: string;
  project: string;
  date: string;
  hours: string;
  note: string;
};
export type TimeField = keyof TimeForm;
type Issues<F extends string> = { path: F; message: string }[];

export function entryFromForm(form: TimeForm): Result<Omit<TimeEntry, 'id'>> {
  const issues: Issues<TimeField> = [];
  const client = asSlug(form.client.trim());
  if (!client) issues.push({ path: 'client', message: 'Choose a client.' });
  const projectText = form.project.trim();
  const project = projectText ? asSlug(projectText) : null;
  if (projectText && !project) issues.push({ path: 'project', message: 'Choose a valid project.' });
  if (!isRealDate(form.date)) issues.push({ path: 'date', message: 'Enter a date as YYYY-MM-DD.' });
  const minutes = parseHours(form.hours);
  if (minutes === null) issues.push({ path: 'hours', message: `Not a duration. ${HOURS_HINT}` });
  else if (minutes < 1) issues.push({ path: 'hours', message: 'Time must be at least 1 minute.' });
  else if (minutes > 1440) issues.push({ path: 'hours', message: 'At most 24 hours per entry.' });
  const note = form.note.trim();
  if (!note) issues.push({ path: 'note', message: 'Add a short note on what you did.' });
  if (issues.length > 0 || !client || minutes === null) return { ok: false, issues };
  return {
    ok: true,
    value: { date: form.date, minutes, client, ...(project ? { project } : {}), note },
  };
}

/** Minor units from `500`, `500.5`, `1.200,50` or `1,200.50`; a bare `12,345` is ambiguous and refused. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/\s+/g, '');
  const m =
    /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s) ??
    /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(s) ??
    /^(\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/.exec(s);
  if (!m) return null;
  const value = Number(`${(m[1] ?? '').replace(/[.,]/g, '')}${(m[2] ?? '').padEnd(2, '0')}`);
  return Number.isSafeInteger(value) ? value : null;
}

export type PaymentForm = { amount: string; date: string; method: string; ref: string };
export type PaymentField = keyof PaymentForm;

/** An empty amount means the open amount, so paying in full is one tap. */
export function paymentFromForm(
  form: PaymentForm,
  openAmount: number,
): Result<Pick<Payment, 'amount' | 'date' | 'method' | 'ref'>> {
  const issues: Issues<PaymentField> = [];
  const text = form.amount.trim();
  const amount = text === '' ? openAmount : parseMoney(text);
  if (amount === null)
    issues.push({ path: 'amount', message: 'Enter an amount like 500 or 500.00.' });
  else if (amount < 1) issues.push({ path: 'amount', message: 'The amount must be more than 0.' });
  if (!isRealDate(form.date)) issues.push({ path: 'date', message: 'Enter a date as YYYY-MM-DD.' });
  if (issues.length > 0 || amount === null) return { ok: false, issues };
  const method = form.method.trim();
  const ref = form.ref.trim();
  return {
    ok: true,
    value: { amount, date: form.date, ...(method ? { method } : {}), ...(ref ? { ref } : {}) },
  };
}

/** First message per field, for inline errors. */
export function fieldErrors<F extends string>(result: Result<unknown>): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  if (result.ok) return errors;
  for (const issue of result.issues) {
    const field = issue.path as F;
    errors[field] ??= issue.message;
  }
  return errors;
}
