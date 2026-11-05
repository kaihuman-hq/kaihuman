import {
  type BusinessRepo,
  deriveInvoiceStatus,
  type Issued,
  paymentsPath,
  recordPayment,
  ulid,
} from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { PRIMARY } from '../components/business/buttons';
import { Field, INPUT } from '../components/business/FormField';
import { money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { todayLocal } from '../lib/business/dates';
import {
  initialPaymentForm,
  overpaidBy,
  overpaymentPrompt,
  type PaymentField,
  type PaymentForm,
  paymentFieldErrors,
  paymentFromForm,
} from '../lib/business/payment-form';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const currencyOf = (data: BusinessRepo, invoice: Issued) =>
  invoice.currency ?? data.profile?.currency ?? 'EUR';

function PaymentFormBody(props: { target: KBRepo; data: BusinessRepo; invoice: Issued }) {
  const { target, data, invoice } = props;
  const today = todayLocal();
  const currency = currencyOf(data, invoice);
  const { open } = deriveInvoiceStatus(
    invoice,
    data.payments,
    data.issued.filter((i) => i.doc.kind === 'credit-note').map((i) => i.doc),
    data.events,
    today,
  );
  const [form, setForm] = useState<PaymentForm>(() => initialPaymentForm(open, currency, today));
  const [errors, setErrors] = useState<Partial<Record<PaymentField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  // The excess the user has been asked to confirm; any edit asks again.
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const set = (key: PaymentField, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setConfirming(null);
  };
  const a11y = (key: PaymentField) => ({
    'aria-invalid': errors[key] ? (true as const) : undefined,
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.current) return;
    const payment = paymentFromForm(form, open);
    setErrors(paymentFieldErrors(payment));
    if (!payment.ok) {
      setError('Some fields need attention.');
      return;
    }
    const excess = overpaidBy(payment.value.amount, open);
    if (excess > 0 && confirming === null) {
      setConfirming(excess);
      setError(null);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    const id = ulid();
    try {
      const file = paymentsPath(Number(payment.value.date.slice(0, 4)));
      const result = await writeBusiness(target, async (fresh) =>
        recordPayment(
          fresh.repo,
          await fresh.read(file),
          { invoice: invoice.number, ...payment.value },
          id,
        ),
      );
      if (!result.ok) {
        setErrors(paymentFieldErrors(result));
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      route(`/clients/${invoice.client}`);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate class="max-w-xl space-y-3">
      <p class="text-xs">
        {invoice.number}, <a href={`/clients/${invoice.client}`}>{invoice.client}</a>: open{' '}
        {money(open, currency)} of {money(invoice.totals.gross, currency)}
      </p>
      <Field id="amount" label={`Amount (${currency})`} error={errors.amount}>
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          class={INPUT}
          value={form.amount}
          disabled={busy}
          {...a11y('amount')}
          onInput={(e) => set('amount', (e.target as HTMLInputElement).value)}
        />
      </Field>
      <Field id="date" label="Date received" error={errors.date}>
        <input
          id="date"
          type="date"
          class={INPUT}
          value={form.date}
          disabled={busy}
          {...a11y('date')}
          onInput={(e) => set('date', (e.target as HTMLInputElement).value)}
        />
      </Field>
      <Field id="method" label="Method (optional)" error={errors.method}>
        <input
          id="method"
          type="text"
          class={INPUT}
          value={form.method}
          disabled={busy}
          placeholder="transfer"
          onInput={(e) => set('method', (e.target as HTMLInputElement).value)}
        />
      </Field>
      <Field id="ref" label="Reference (optional)" error={errors.ref}>
        <input
          id="ref"
          type="text"
          class={INPUT}
          value={form.ref}
          disabled={busy}
          onInput={(e) => set('ref', (e.target as HTMLInputElement).value)}
        />
      </Field>
      {confirming !== null && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {overpaymentPrompt(confirming, currency)}
        </p>
      )}
      <button type="submit" disabled={busy} class={PRIMARY}>
        {busy ? 'Saving...' : confirming !== null ? 'Record anyway' : 'Record payment'}
      </button>
      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}

export function PaymentFormPage({ invoice }: { invoice?: string }) {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Record payment">
      {({ repo, data }) => {
        const doc = data.issued.find((i) => i.doc.number === invoice && i.doc.kind === 'invoice');
        if (!doc) {
          return (
            <p class="text-xs">
              No invoice <code>{invoice}</code>.{' '}
              <a href="/business" class="text-[var(--los-accent)] hover:underline">
                Back to business
              </a>
            </p>
          );
        }
        return <PaymentFormBody target={repo} data={data} invoice={doc.doc} />;
      }}
    </PageShell>
  );
}
