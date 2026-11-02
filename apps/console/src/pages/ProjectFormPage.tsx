import { createProject } from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { a11y, Field, INPUT, More } from '../components/business/FormField';
import { PageShell } from '../components/business/PageShell';
import {
  emptyProjectForm,
  MONEY_HINT,
  type ProjectForm,
  projectFieldErrors,
  projectFromForm,
  withName,
  withSlug,
} from '../lib/business/client-form';
import { HOURS_HINT } from '../lib/business/time-form';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const STATUSES = ['active', 'paused', 'done'] as const;

function NewProjectForm(props: { target: KBRepo; client: Parameters<typeof projectFromForm>[1] }) {
  const { target, client } = props;
  const [form, setForm] = useState<ProjectForm>(emptyProjectForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectForm, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  type TextKey = {
    [K in keyof ProjectForm]: ProjectForm[K] extends string ? K : never;
  }[keyof ProjectForm];
  const input = (key: TextKey, extra = {}) => ({
    id: key,
    type: 'text',
    value: form[key],
    disabled: busy,
    class: INPUT,
    ...a11y(key, errors[key]),
    onInput: (e: Event) => set(key, (e.target as HTMLInputElement).value as never),
    ...extra,
  });
  const err = (key: keyof ProjectForm) => (errors[key] ? { error: errors[key] } : {});

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.current) return;
    const project = projectFromForm(form, client);
    setErrors(projectFieldErrors(project));
    if (!project.ok) {
      setError('Some fields need attention.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await writeBusiness(target, async (fresh) =>
        createProject(fresh.repo, project.value),
      );
      if (!result.ok) {
        setErrors(projectFieldErrors(result));
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      route(`/clients/${client}`);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const select = (id: 'status' | 'ratePer' | 'retainerInterval', values: readonly string[]) => (
    <select
      id={id}
      class={INPUT}
      value={form[id]}
      disabled={busy}
      onChange={(e) => set(id, (e.target as HTMLSelectElement).value as never)}
    >
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );

  return (
    <form onSubmit={handleSubmit} noValidate class="max-w-xl space-y-3">
      <Field id="name" label="Name" {...err('name')}>
        <input
          {...input('name', {
            onInput: (e: Event) =>
              setForm((f) => withName(f, (e.target as HTMLInputElement).value)),
          })}
        />
      </Field>
      <Field
        id="slug"
        label="Slug"
        hint="The file name. Follows the name until you edit it."
        {...err('slug')}
      >
        <input
          {...input('slug', {
            onInput: (e: Event) =>
              setForm((f) => withSlug(f, (e.target as HTMLInputElement).value)),
          })}
        />
      </Field>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="rateAmount" label="Rate (amount)" hint={MONEY_HINT} {...err('rateAmount')}>
          <input {...input('rateAmount', { inputMode: 'decimal' })} />
        </Field>
        <Field id="ratePer" label="Rate per">
          {select('ratePer', ['hour', 'day'])}
        </Field>
      </div>
      <More
        open={(
          [
            'fixedPrice',
            'budgetHours',
            'budgetAmount',
            'retainerAmount',
            'retainerNextDate',
            'retainerDescription',
          ] as const
        ).some((k) => errors[k])}
      >
        <Field id="status" label="Status">
          {select('status', STATUSES)}
        </Field>
        <Field id="fixedPrice" label="Fixed price" hint={MONEY_HINT} {...err('fixedPrice')}>
          <input {...input('fixedPrice', { inputMode: 'decimal' })} />
        </Field>
        <Field id="budgetHours" label="Budget (hours)" hint={HOURS_HINT} {...err('budgetHours')}>
          <input {...input('budgetHours')} />
        </Field>
        <Field id="budgetAmount" label="Budget (amount)" hint={MONEY_HINT} {...err('budgetAmount')}>
          <input {...input('budgetAmount', { inputMode: 'decimal' })} />
        </Field>
        <Field
          id="retainerAmount"
          label="Retainer amount"
          hint={MONEY_HINT}
          {...err('retainerAmount')}
        >
          <input {...input('retainerAmount', { inputMode: 'decimal' })} />
        </Field>
        <Field id="retainerInterval" label="Retainer interval">
          {select('retainerInterval', ['monthly', 'quarterly'])}
        </Field>
        <Field
          id="retainerNextDate"
          label="Retainer next date"
          hint="YYYY-MM-DD"
          {...err('retainerNextDate')}
        >
          <input {...input('retainerNextDate', { type: 'date' })} />
        </Field>
        <Field
          id="retainerDescription"
          label="Retainer description"
          {...err('retainerDescription')}
        >
          <input {...input('retainerDescription')} />
        </Field>
      </More>
      <button
        type="submit"
        disabled={busy}
        class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving...' : 'Create project'}
      </button>
      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}

export function ProjectFormPage({ slug }: { slug?: string }) {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="New project">
      {({ repo, data }) => {
        const client = data.clients.find((c) => c.slug === slug);
        return client ? (
          <>
            <p class="text-xs">
              For{' '}
              <a href={`/clients/${client.slug}`} class="text-[var(--los-accent)] hover:underline">
                {client.name}
              </a>
            </p>
            <NewProjectForm target={repo} client={client.slug} />
          </>
        ) : (
          <p class="text-xs">
            No client <code>{slug}</code>.{' '}
            <a href="/clients" class="text-[var(--los-accent)] hover:underline">
              Back to clients
            </a>
          </p>
        );
      }}
    </PageShell>
  );
}
