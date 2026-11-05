import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import { StatusBar } from '@kaihuman/ui';
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { PRIMARY } from '../components/business/buttons';
import { INPUT } from '../components/business/FormField';
import {
  canSubmit,
  EMPTY_FORM,
  type EnableForm,
  enableErrorMessage,
  fieldErrors,
  profileFromForm,
} from '../lib/business/enable-form';
import { AlreadyEnabledError, PublicRepoError } from '../lib/business/errors';
import { BUSINESS_PROFILE_PATH } from '../lib/business/load';
import { syncKB } from '../lib/github-kb';

const CONFIRMATIONS = [
  {
    key: 'confirmRetention',
    label:
      'This repository now holds tax records for 8 years. I will never delete it or rewrite its history.',
  },
  {
    key: 'confirmBranchProtection',
    label:
      'I will protect the main branch against force-push and deletion (GitHub → Settings → Branches).',
  },
  {
    key: 'confirmAccess',
    label: 'Anyone with access to this repository sees the business data.',
  },
] as const;

function Field(props: {
  id: keyof EnableForm;
  label: string;
  hint?: string;
  error?: string;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <div class={props.class}>
      <label for={props.id} class="block text-xs text-[var(--los-fg-dim)] mb-1">
        {props.label}
      </label>
      {props.children}
      {props.hint && !props.error && (
        <p class="text-[10px] text-[var(--los-fg-dim)] mt-1">{props.hint}</p>
      )}
      {props.error && (
        <p id={`${props.id}-error`} class="text-xs text-[var(--los-warning)] mt-1">
          {props.error}
        </p>
      )}
    </div>
  );
}

function Group(props: { title: string; children: ComponentChildren }) {
  return (
    <fieldset class="border border-[var(--los-border)] rounded p-3 min-w-0">
      <legend class="px-1 text-xs font-bold text-[var(--los-fg)]">{props.title}</legend>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">{props.children}</div>
    </fieldset>
  );
}

export function BusinessEnablePage() {
  const repo = githubProfileStore.currentRepo.value;
  const [form, setForm] = useState<EnableForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof EnableForm, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Files GitHub refused to commit (the workflow without the `workflow` scope), shown for adding by hand.
  const [skipped, setSkipped] = useState<Record<string, string> | null>(null);
  // Set synchronously: `busy` only changes after the next render, so two quick submits could both pass.
  const submitting = useRef(false);

  const bar = (
    <StatusBar
      mode="BUSINESS"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/stream')}
      onWikiClick={() => route('/wiki')}
    />
  );

  if (repo && skipped) {
    return (
      <>
        <div class="h-[calc(100vh-2rem)] overflow-y-auto p-6 text-sm font-mono text-[var(--los-fg)] space-y-3">
          <p>Business is enabled.</p>
          {Object.entries(skipped).map(([path, content]) => (
            <div key={path} class="space-y-2">
              <p class="text-xs text-[var(--los-warning)]">
                GitHub did not let kaihuman add <code>{path}</code>: sign-in has no permission to
                change workflows. Without it the business check does not run on push. Add the file
                yourself:
              </p>
              <a
                href={`https://github.com/${repo.full_name}/new/${repo.default_branch}?filename=${encodeURIComponent(path)}&value=${encodeURIComponent(content)}`}
                target="_blank"
                rel="noreferrer"
                class="text-[var(--los-accent)] hover:underline"
              >
                Create it on GitHub
              </a>
              <pre class="text-[10px] whitespace-pre-wrap border border-[var(--los-border)] rounded p-2 max-h-64 overflow-auto">
                {content}
              </pre>
            </div>
          ))}
          <a href="/business" class="text-[var(--los-accent)] hover:underline">
            Open the business dashboard
          </a>
        </div>
        {bar}
      </>
    );
  }

  if (!repo) {
    return (
      <>
        <div class="h-[calc(100vh-2rem)] p-6 text-[var(--los-fg-dim)] text-sm font-mono">
          Select a repository to enable business in.
        </div>
        {bar}
      </>
    );
  }

  const alreadyEnabled =
    githubFileStore.loadedRepo.value === repo.full_name &&
    githubFileStore.tree.value.some((item) => item.path === BUSINESS_PROFILE_PATH);
  if (alreadyEnabled) {
    return (
      <>
        <div class="h-[calc(100vh-2rem)] p-6 text-sm font-mono text-[var(--los-fg)]">
          <p>Business is already enabled in this repository.</p>
          <a href="/business" class="text-[var(--los-accent)] hover:underline">
            Open the business dashboard
          </a>
        </div>
        {bar}
      </>
    );
  }

  const isPublic = repo.private !== true;
  const disabled = busy || isPublic;
  const set = <K extends keyof EnableForm>(key: K, value: EnableForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const text = (
    key: Exclude<keyof EnableForm, 'vatRegime' | 'vatBasis' | `confirm${string}`>,
    props = {},
  ) => (
    <input
      id={key}
      type="text"
      value={form[key]}
      disabled={disabled}
      aria-invalid={errors[key] ? true : undefined}
      aria-describedby={errors[key] ? `${key}-error` : undefined}
      onInput={(e) => set(key, (e.target as HTMLInputElement).value)}
      class={INPUT}
      {...props}
    />
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!repo || isPublic || submitting.current || !canSubmit(form)) return;
    const result = profileFromForm(form);
    setErrors(fieldErrors(result));
    if (!result.ok) {
      setError('Some fields need attention.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    let kbInstalled = false;
    try {
      // Two commits for a repo without a knowledge base: its setup, then business. The probe
      // may also commit pending skill updates, as on the other pages.
      if ((await syncKB(repo)) === 'missing') {
        await syncKB(repo, { install: true });
        kbInstalled = true;
      }
      // Loaded here so the bundled check stays out of the main chunk.
      const { enableBusiness } = await import('../lib/business-setup');
      const done = await enableBusiness(repo, result.value);
      await githubFileStore.loadTree();
      if (Object.keys(done.skipped).length > 0) setSkipped(done.skipped);
      else route('/business');
    } catch (err) {
      const known = err instanceof PublicRepoError || err instanceof AlreadyEnabledError;
      setError(
        kbInstalled && !known
          ? `The knowledge base was set up, but enabling business failed: ${err instanceof Error ? err.message : String(err)}`
          : enableErrorMessage(err),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div class="h-[calc(100vh-2rem)] overflow-y-auto p-4 font-mono">
        <form onSubmit={handleSubmit} noValidate class="max-w-2xl mx-auto space-y-4">
          <header>
            <h1 class="text-base font-bold text-[var(--los-fg)]">Enable business</h1>
            <p class="text-xs text-[var(--los-fg-dim)] mt-1">
              Sets up invoices, clients and time tracking in{' '}
              <span class="text-[var(--los-accent)]">{repo.full_name}</span>.
            </p>
          </header>

          {isPublic && (
            <p role="alert" class="text-sm text-[var(--los-warning)]">
              {enableErrorMessage(new PublicRepoError(repo.full_name))}
            </p>
          )}

          <Group title="Business">
            <Field id="name" label="Business name" error={errors.name} class="sm:col-span-2">
              {text('name')}
            </Field>
          </Group>

          <Group title="Address">
            <Field
              id="street"
              label="Street and number"
              error={errors.street}
              class="sm:col-span-2"
            >
              {text('street')}
            </Field>
            <Field id="postcode" label="Postcode" error={errors.postcode}>
              {text('postcode')}
            </Field>
            <Field id="city" label="City" error={errors.city}>
              {text('city')}
            </Field>
            <Field
              id="country"
              label="Country (2-letter code)"
              hint="DE applies German invoice rules."
              error={errors.country}
            >
              {text('country', { maxLength: 2 })}
            </Field>
          </Group>

          <Group title="Tax">
            <Field id="vatId" label="VAT ID (optional)" error={errors.vatId}>
              {text('vatId')}
            </Field>
            <Field id="taxNumber" label="Tax number (optional)" error={errors.taxNumber}>
              {text('taxNumber')}
            </Field>
            <Field id="vatRegime" label="VAT regime" class="sm:col-span-2">
              <select
                id="vatRegime"
                value={form.vatRegime}
                disabled={disabled}
                onChange={(e) =>
                  set('vatRegime', (e.target as HTMLSelectElement).value as EnableForm['vatRegime'])
                }
                class={INPUT}
              >
                <option value="regular">Regular (charges VAT)</option>
                <option value="small-business">Small business (§19 UStG, no VAT)</option>
              </select>
            </Field>
            <Field
              id="vatBasis"
              label="VAT basis"
              class="sm:col-span-2"
              hint="Soll: VAT is due for the quarter of the invoice date. Ist: for the quarter the payment arrives (needs approval by the Finanzamt). Only matters for the regular regime."
            >
              <select
                id="vatBasis"
                value={form.vatBasis}
                disabled={disabled}
                onChange={(e) =>
                  set('vatBasis', (e.target as HTMLSelectElement).value as EnableForm['vatBasis'])
                }
                class={INPUT}
              >
                <option value="accrual">Soll (accrual, by invoice date)</option>
                <option value="cash">Ist (cash, by payment date)</option>
              </select>
            </Field>
          </Group>

          <Group title="Contact">
            <Field id="contactName" label="Contact name" error={errors.contactName}>
              {text('contactName')}
            </Field>
            <Field id="email" label="Email" error={errors.email}>
              {text('email', { type: 'email' })}
            </Field>
            <Field id="phone" label="Phone (optional)" error={errors.phone}>
              {text('phone', { type: 'tel' })}
            </Field>
          </Group>

          <Group title="Bank">
            <Field id="iban" label="IBAN" error={errors.iban}>
              {text('iban')}
            </Field>
            <Field id="bic" label="BIC (optional)" error={errors.bic}>
              {text('bic')}
            </Field>
          </Group>

          <Group title="Terms">
            <Field
              id="paymentTermsDays"
              label="Payment terms (days)"
              error={errors.paymentTermsDays}
            >
              {text('paymentTermsDays', { inputMode: 'numeric' })}
            </Field>
          </Group>

          <fieldset class="border border-[var(--los-border)] rounded p-3 space-y-2 min-w-0">
            <legend class="px-1 text-xs font-bold text-[var(--los-fg)]">Please confirm</legend>
            {CONFIRMATIONS.map(({ key, label }) => (
              <div key={key} class="flex items-start gap-2">
                <input
                  id={key}
                  type="checkbox"
                  checked={form[key]}
                  disabled={disabled}
                  onChange={(e) => set(key, (e.target as HTMLInputElement).checked)}
                  class="mt-0.5 shrink-0"
                />
                <label for={key} class="text-xs text-[var(--los-fg)]">
                  {label}
                </label>
              </div>
            ))}
          </fieldset>

          <button type="submit" disabled={disabled || !canSubmit(form)} class={PRIMARY}>
            {busy ? 'Setting up...' : 'Enable business'}
          </button>
          {error && (
            <p role="alert" class="text-xs text-[var(--los-warning)]">
              {error}
            </p>
          )}
        </form>
      </div>
      {bar}
    </>
  );
}
