import { demoMode } from '@kaihuman/core';
import {
  type BusinessRepo,
  deleteExpense,
  type Expense,
  formatMinor,
  RECEIPT_EXTENSIONS,
  retentionEnd,
  saveExpense,
} from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { a11y, Field, INPUT } from '../components/business/FormField';
import { PageShell } from '../components/business/PageShell';
import { todayLocal } from '../lib/business/dates';
import {
  checkReceiptFile,
  EXPENSE_CATEGORIES,
  type ExpenseField,
  type ExpenseForm,
  emptyExpenseForm,
  expenseFieldErrors,
  expenseFormFromExpense,
  expenseFromForm,
  grossOf,
  withSuggestedVat,
} from '../lib/business/expense-form';
import { showNotice } from '../lib/business/notice';
import { openReceipt } from '../lib/business/receipt';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const LIST = '/business/expenses';
const ACCEPT = RECEIPT_EXTENSIONS.map((e) => `.${e}`).join(',');
const BUTTON =
  'px-4 py-2 text-sm rounded disabled:opacity-50 border border-[var(--los-border)] hover:opacity-90';

function ExpenseEditor(props: {
  target: KBRepo;
  data: BusinessRepo;
  start: ExpenseForm;
  existing: Expense | undefined;
}) {
  const { target, data, start, existing } = props;
  const currency = data.profile?.currency ?? 'EUR';
  const [form, setForm] = useState<ExpenseForm>(start);
  const [file, setFile] = useState<{ ext: string; file: File } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ExpenseField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set synchronously: `busy` only changes after the next render.
  const submitting = useRef(false);
  const locked = busy || demoMode.value;

  const set = (patch: Partial<ExpenseForm>) => setForm((f) => withSuggestedVat({ ...f, ...patch }));
  const bind = (key: ExpenseField) => ({
    id: key,
    value: form[key],
    ...a11y(key, errors[key]),
    onInput: (e: Event) => set({ [key]: (e.target as HTMLInputElement).value }),
  });

  const categories = [
    ...new Set([...data.expenses.map((e) => e.category), ...EXPENSE_CATEGORIES]),
  ].sort((a, b) => a.localeCompare(b));
  const projects = data.projects.filter((p) => p.client === form.client);

  // Gross is shown from what the amount fields parse to; while one is invalid it stays empty.
  const grossMinor = grossOf(form);
  const gross = grossMinor === null ? '' : formatMinor(grossMinor, currency);

  function chooseFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (!picked) {
      setFile(null);
      set({ receipt: existing?.receipt ?? '' });
      setErrors((x) => ({ ...x, receipt: undefined }));
      return;
    }
    // Before any network call: size and type are what the user can fix right here.
    const checked = checkReceiptFile(picked);
    if (!checked.ok) {
      input.value = '';
      setFile(null);
      set({ receipt: existing?.receipt ?? '' });
      setErrors((x) => ({ ...x, receipt: checked.issues[0]?.message }));
      return;
    }
    setFile({ ext: checked.value.ext, file: picked });
    set({ receipt: `${form.id}.${checked.value.ext}` });
    setErrors((x) => ({ ...x, receipt: undefined }));
  }

  async function run(build: Parameters<typeof writeBusiness>[1], notice: string): Promise<void> {
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await writeBusiness(target, build);
      if (!result.ok) {
        setErrors(expenseFieldErrors(result));
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      showNotice(notice, LIST);
      route(LIST);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.current || demoMode.value) return;
    const expense = expenseFromForm(form);
    const fieldErrors = expenseFieldErrors(expense);
    if (errors.receipt) fieldErrors.receipt = errors.receipt;
    setErrors(fieldErrors);
    if (!expense.ok || errors.receipt) {
      setError('Some fields need attention.');
      return;
    }
    submitting.current = true;
    let receipt: { ext: string; bytes: Uint8Array } | undefined;
    try {
      if (file) receipt = { ext: file.ext, bytes: new Uint8Array(await file.file.arrayBuffer()) };
    } catch {
      submitting.current = false;
      setError('Could not read the receipt file.');
      return;
    }
    submitting.current = false;
    await run(
      async (fresh) => saveExpense(fresh.repo, expense.value, receipt),
      `Saved expense ${expense.value.supplier}.`,
    );
  }

  async function remove() {
    if (submitting.current || demoMode.value || !existing) return;
    await run(
      async (fresh) => deleteExpense(fresh.repo, existing.id),
      `Deleted expense ${existing.supplier}.`,
    );
  }

  const keepUntil = existing ? retentionEnd(data, existing.date) : '';
  const inRetention = existing !== undefined && todayLocal() <= keepUntil;

  return (
    <form onSubmit={handleSubmit} noValidate class="max-w-3xl space-y-3">
      {demoMode.value && (
        <p class="text-xs text-[var(--los-muted)]">Saving is not available in demo mode.</p>
      )}
      <fieldset disabled={locked} class="min-w-0 border-0 p-0 m-0 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="date" label="Date" error={errors.date}>
            <input type="date" class={INPUT} {...bind('date')} />
          </Field>
          <Field id="supplier" label="Supplier" error={errors.supplier}>
            <input type="text" class={INPUT} {...bind('supplier')} />
          </Field>
          <Field id="description" label="Description" error={errors.description}>
            <input type="text" class={INPUT} {...bind('description')} />
          </Field>
          <Field id="category" label="Category" error={errors.category}>
            <input type="text" list="category-list" class={INPUT} {...bind('category')} />
            <datalist id="category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field id="net" label={`Net (${currency})`} error={errors.net}>
            <input type="text" inputMode="decimal" class={INPUT} {...bind('net')} />
          </Field>
          <Field id="vatRate" label="VAT rate (%)" error={errors.vatRate}>
            <input type="text" inputMode="decimal" class={INPUT} {...bind('vatRate')} />
          </Field>
          <Field
            id="vat"
            label={`VAT (${currency})`}
            hint="Suggested from net and rate; change it to match the receipt."
            error={errors.vat}
          >
            <input
              type="text"
              inputMode="decimal"
              class={INPUT}
              {...bind('vat')}
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value;
                // Emptying the field hands the VAT back to the suggestion.
                set({ vat: value, vatTouched: value.trim() !== '' });
              }}
            />
          </Field>
          <Field id="gross" label={`Gross (${currency})`}>
            <input id="gross" type="text" class={INPUT} readOnly value={gross} />
          </Field>
          <Field id="client" label="Client (optional)" error={errors.client}>
            <select
              id="client"
              class={INPUT}
              value={form.client}
              onChange={(e) => set({ client: (e.target as HTMLSelectElement).value, project: '' })}
            >
              <option value="">None</option>
              {data.clients.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="project" label="Project (optional)" error={errors.project}>
            <select
              id="project"
              class={INPUT}
              value={form.project}
              disabled={form.client === ''}
              onChange={(e) => set({ project: (e.target as HTMLSelectElement).value })}
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          id="receipt"
          label="Receipt (optional)"
          hint="PDF, JPG, PNG, WEBP or HEIC, up to 10 MB."
          error={errors.receipt}
        >
          <input
            id="receipt"
            type="file"
            accept={ACCEPT}
            class={INPUT}
            {...a11y('receipt', errors.receipt)}
            onChange={chooseFile}
          />
        </Field>
        {existing?.receipt && (
          <p class="text-xs">
            Current receipt: {existing.receipt}{' '}
            <button
              type="button"
              class="text-[var(--los-accent)] hover:underline"
              onClick={() =>
                openReceipt(target, existing).catch((e) =>
                  setError(
                    `Could not open the receipt: ${e instanceof Error ? e.message : String(e)}`,
                  ),
                )
              }
            >
              Open
            </button>
            {file && ' (replaced when you save)'}
          </p>
        )}
        <div class="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={locked}
            class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save expense'}
          </button>
          <a href={LIST} class={BUTTON}>
            Cancel
          </a>
          {existing && !confirmDelete && (
            <button type="button" class={BUTTON} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
        {confirmDelete && (
          <p
            role="alert"
            class="text-xs text-[var(--los-warning)] flex flex-wrap items-center gap-2"
          >
            {inRetention
              ? `This record must be kept until ${keepUntil} (retention). Delete anyway?`
              : 'Delete this expense? This cannot be undone.'}
            <button type="button" class={BUTTON} onClick={remove}>
              Yes, delete expense
            </button>
            <button type="button" class={BUTTON} onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </p>
        )}
      </fieldset>
      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}

export function ExpenseFormPage({ id }: { id?: string }) {
  const state = useBusinessRepo();
  // One form (and id) per page visit, so a failed save and a retry write the same files.
  const [fresh] = useState(() => (id ? null : emptyExpenseForm(null, todayLocal())));
  return (
    <PageShell state={state} title={id ? 'Edit expense' : 'New expense'}>
      {({ repo, data }) => {
        const existing = id ? data.expenses.find((e) => e.id === id) : undefined;
        if (id && !existing) {
          return (
            <p class="text-xs">
              No expense <code>{id}</code>.{' '}
              <a href={LIST} class="text-[var(--los-accent)] hover:underline">
                Back to expenses
              </a>
            </p>
          );
        }
        const start = existing
          ? expenseFormFromExpense(existing, data.profile?.currency ?? 'EUR')
          : { ...(fresh as ExpenseForm), vatRate: data.profile?.default_vat_rate ?? '19' };
        return <ExpenseEditor target={repo} data={data} start={start} existing={existing} />;
      }}
    </PageShell>
  );
}
