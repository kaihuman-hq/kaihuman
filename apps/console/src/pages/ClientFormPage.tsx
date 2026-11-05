import { CLIENT_STAGES, createClient } from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { PRIMARY } from '../components/business/buttons';
import { a11y, Field, INPUT, More } from '../components/business/FormField';
import { PageShell } from '../components/business/PageShell';
import {
  type ClientForm,
  clientFieldErrors,
  clientFromForm,
  emptyClientForm,
  isClientStage,
  withName,
  withSlug,
} from '../lib/business/client-form';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const OPTIONAL: (keyof ClientForm)[] = [
  'vatId',
  'buyerReference',
  'leitwegId',
  'contactName',
  'email',
  'phone',
  'paymentTermsDays',
  'stage',
];

function NewClientForm({ target }: { target: KBRepo }) {
  const [form, setForm] = useState<ClientForm>(emptyClientForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ClientForm, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set synchronously: `busy` only changes after the next render, so two quick submits could both pass.
  const submitting = useRef(false);

  const set = <K extends keyof ClientForm>(key: K, value: ClientForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const text = (key: Exclude<keyof ClientForm, 'slugEdited' | 'stage'>, extra = {}) => ({
    id: key,
    value: form[key],
    disabled: busy,
    class: INPUT,
    ...a11y(key, errors[key]),
    onInput: (e: Event) => set(key, (e.target as HTMLInputElement).value),
    ...extra,
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.current) return;
    const client = clientFromForm(form);
    setErrors(clientFieldErrors(client));
    if (!client.ok) {
      setError('Some fields need attention.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await writeBusiness(target, async (fresh) =>
        createClient(fresh.repo, client.value),
      );
      if (!result.ok) {
        setErrors(clientFieldErrors(result));
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      route(`/clients/${client.value.slug}`);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate class="max-w-xl space-y-3">
      <Field id="name" label="Name" {...(errors.name ? { error: errors.name } : {})}>
        <input
          type="text"
          autocomplete="organization"
          {...text('name', {
            onInput: (e: Event) =>
              setForm((f) => withName(f, (e.target as HTMLInputElement).value)),
          })}
        />
      </Field>
      <Field
        id="slug"
        label="Slug"
        hint="The folder name. Follows the name until you edit it."
        {...(errors.slug ? { error: errors.slug } : {})}
      >
        <input
          type="text"
          {...text('slug', {
            onInput: (e: Event) =>
              setForm((f) => withSlug(f, (e.target as HTMLInputElement).value)),
          })}
        />
      </Field>
      <Field id="street" label="Street" {...(errors.street ? { error: errors.street } : {})}>
        <input type="text" autocomplete="address-line1" {...text('street')} />
      </Field>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          id="postcode"
          label="Postcode"
          {...(errors.postcode ? { error: errors.postcode } : {})}
        >
          <input type="text" autocomplete="postal-code" {...text('postcode')} />
        </Field>
        <Field id="city" label="City" {...(errors.city ? { error: errors.city } : {})}>
          <input type="text" autocomplete="address-level2" {...text('city')} />
        </Field>
      </div>
      <Field
        id="country"
        label="Country (2 letters)"
        {...(errors.country ? { error: errors.country } : {})}
      >
        <input type="text" maxLength={2} {...text('country')} />
      </Field>
      <More open={OPTIONAL.some((k) => errors[k])}>
        <Field id="stage" label="Stage">
          <select
            id="stage"
            class={INPUT}
            value={form.stage}
            disabled={busy}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (isClientStage(v)) set('stage', v);
            }}
          >
            {CLIENT_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field id="vatId" label="VAT ID" {...(errors.vatId ? { error: errors.vatId } : {})}>
          <input type="text" {...text('vatId')} />
        </Field>
        <Field
          id="contactName"
          label="Contact name"
          {...(errors.contactName ? { error: errors.contactName } : {})}
        >
          <input type="text" autocomplete="name" {...text('contactName')} />
        </Field>
        <Field id="email" label="Contact email" {...(errors.email ? { error: errors.email } : {})}>
          <input type="email" autocomplete="email" {...text('email')} />
        </Field>
        <Field id="phone" label="Contact phone" {...(errors.phone ? { error: errors.phone } : {})}>
          <input type="tel" autocomplete="tel" {...text('phone')} />
        </Field>
        <Field
          id="paymentTermsDays"
          label="Payment terms (days)"
          {...(errors.paymentTermsDays ? { error: errors.paymentTermsDays } : {})}
        >
          <input type="text" inputMode="numeric" {...text('paymentTermsDays')} />
        </Field>
        <Field
          id="buyerReference"
          label="Buyer reference"
          {...(errors.buyerReference ? { error: errors.buyerReference } : {})}
        >
          <input type="text" {...text('buyerReference')} />
        </Field>
        <Field
          id="leitwegId"
          label="Leitweg-ID"
          {...(errors.leitwegId ? { error: errors.leitwegId } : {})}
        >
          <input type="text" {...text('leitwegId')} />
        </Field>
      </More>
      <button type="submit" disabled={busy} class={PRIMARY}>
        {busy ? 'Saving...' : 'Create client'}
      </button>
      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}

export function ClientFormPage() {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="New client">
      {({ repo }) => <NewClientForm target={repo} />}
    </PageShell>
  );
}
