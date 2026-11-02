import { demoMode } from '@kaihuman/core';
import {
  type BusinessRepo,
  CONTRACT_EXTENSIONS,
  type Contract,
  contractFilePath,
  deleteContract,
  retentionEnd,
  saveContract,
} from '@kaihuman/formats/business';
import { useEffect, useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { a11y, Field, INPUT } from '../components/business/FormField';
import { PageShell } from '../components/business/PageShell';
import {
  CONTRACT_KINDS,
  type ContractField,
  type ContractForm,
  checkContractFile,
  contractFieldErrors,
  contractFormFromContract,
  contractFromForm,
  emptyContractForm,
} from '../lib/business/contract-form';
import { todayLocal } from '../lib/business/dates';
import { showNotice } from '../lib/business/notice';
import { openAttachment } from '../lib/business/receipt';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const ACCEPT = CONTRACT_EXTENSIONS.map((e) => `.${e}`).join(',');
const BUTTON =
  'px-4 py-2 text-sm rounded disabled:opacity-50 border border-[var(--los-border)] hover:opacity-90';
const LINK_BUTTON = 'text-[var(--los-accent)] hover:underline';

function ContractEditor(props: {
  target: KBRepo;
  data: BusinessRepo;
  client: string;
  start: ContractForm;
  existing: Contract | undefined;
}) {
  const { target, data, client, start, existing } = props;
  const back = `/clients/${client}`;
  const [form, setForm] = useState<ContractForm>(start);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ContractField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removed, setRemoved] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  // Set synchronously: `busy` only changes after the next render.
  const submitting = useRef(false);
  const locked = busy || demoMode.value;

  // The delete question is a new, urgent control: focus goes to the safe answer.
  useEffect(() => {
    if (confirmDelete) keepRef.current?.focus();
  }, [confirmDelete]);

  const set = (patch: Partial<ContractForm>) => setForm((f) => ({ ...f, ...patch }));
  /** The file the form names when no new file is chosen. */
  const storedFile = removed ? '' : (existing?.file ?? '');
  const bind = (key: Exclude<ContractField, 'file'>) => ({
    id: key,
    value: form[key],
    ...a11y(key, errors[key]),
    onInput: (e: Event) => set({ [key]: (e.target as HTMLInputElement).value }),
  });

  function chooseFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (!picked) {
      setFile(null);
      set({ file: storedFile });
      setErrors((x) => ({ ...x, file: undefined }));
      return;
    }
    // Before any network call: size and type are what the user can fix right here.
    const checked = checkContractFile(picked);
    if (!checked.ok) {
      input.value = '';
      setFile(null);
      set({ file: storedFile });
      setErrors((x) => ({ ...x, file: checked.issues[0]?.message }));
      return;
    }
    setFile(picked);
    set({ file: `${form.id}.pdf` });
    setErrors((x) => ({ ...x, file: undefined }));
  }

  async function run(build: Parameters<typeof writeBusiness>[1], notice: string): Promise<void> {
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await writeBusiness(target, build);
      if (!result.ok) {
        setErrors(contractFieldErrors(result));
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      showNotice(notice, back);
      route(back);
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
    const contract = contractFromForm(client, form);
    setErrors(contractFieldErrors(contract));
    if (!contract.ok) {
      setError('Some fields need attention.');
      return;
    }
    submitting.current = true;
    let bytes: Uint8Array | undefined;
    try {
      if (file) bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      submitting.current = false;
      setError('Could not read the contract file.');
      return;
    }
    submitting.current = false;
    await run(
      async (fresh) => saveContract(fresh.repo, contract.value, bytes),
      `Saved contract ${contract.value.title}.`,
    );
  }

  async function remove() {
    if (submitting.current || demoMode.value || !existing) return;
    await run(
      async (fresh) => deleteContract(fresh.repo, existing.client, existing.id),
      `Deleted contract ${existing.title}.`,
    );
  }

  // Retention runs from the end of the contract; one without an end counts from its start.
  const keepUntil = existing ? retentionEnd(data, existing.end ?? existing.start) : '';
  const inRetention = existing !== undefined && todayLocal() <= keepUntil;

  return (
    <form onSubmit={handleSubmit} noValidate class="max-w-3xl space-y-3">
      {demoMode.value && (
        <p class="text-xs text-[var(--los-muted)]">Saving is not available in demo mode.</p>
      )}
      <fieldset disabled={locked} class="min-w-0 border-0 p-0 m-0 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="title" label="Title" error={errors.title}>
            <input type="text" class={INPUT} {...bind('title')} />
          </Field>
          <Field id="kind" label="Kind" error={errors.kind}>
            <input type="text" list="kind-list" class={INPUT} {...bind('kind')} />
            <datalist id="kind-list">
              {CONTRACT_KINDS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>
          <Field id="start" label="Start" error={errors.start}>
            <input type="date" class={INPUT} {...bind('start')} />
          </Field>
          <Field id="end" label="End (optional)" error={errors.end}>
            <input type="date" class={INPUT} {...bind('end')} />
          </Field>
          <Field
            id="notice"
            label="Notice period in days (optional)"
            hint="Counted back from the renewal date, or the end."
            error={errors.notice}
          >
            <input type="text" inputMode="numeric" class={INPUT} {...bind('notice')} />
          </Field>
          <Field id="renewal" label="Renewal date (optional)" error={errors.renewal}>
            <input type="date" class={INPUT} {...bind('renewal')} />
          </Field>
        </div>
        <Field
          id="file"
          label="Contract file (optional)"
          hint="PDF, up to 10 MB."
          error={errors.file}
          alert
        >
          <input
            id="file"
            type="file"
            accept={ACCEPT}
            class={INPUT}
            {...a11y('file', errors.file)}
            onChange={chooseFile}
          />
        </Field>
        {existing?.file && !removed && (
          <p class="text-xs">
            Current file: {existing.file}{' '}
            <button
              type="button"
              class={LINK_BUTTON}
              onClick={() =>
                openAttachment(target, {
                  path: contractFilePath(existing.client, existing.id),
                  name: existing.file ?? '',
                }).catch((e) =>
                  setError(
                    `Could not open the contract: ${e instanceof Error ? e.message : String(e)}`,
                  ),
                )
              }
            >
              Open
            </button>
            {file && ' (replaced when you save)'}
            {!file && (
              <>
                {' '}
                <button
                  type="button"
                  class={LINK_BUTTON}
                  onClick={() => {
                    setRemoved(true);
                    set({ file: '' });
                  }}
                >
                  Remove file
                </button>
              </>
            )}
          </p>
        )}
        {existing?.file && removed && (
          <p class="text-xs">
            The file is removed when you save.{' '}
            <button
              type="button"
              class={LINK_BUTTON}
              onClick={() => {
                setRemoved(false);
                set({ file: existing.file ?? '' });
              }}
            >
              Keep file
            </button>
          </p>
        )}
        <div class="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={locked}
            class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save contract'}
          </button>
          <a href={back} class={BUTTON}>
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
              : 'Delete this contract? This cannot be undone.'}
            <button type="button" class={BUTTON} onClick={remove}>
              Yes, delete contract
            </button>
            <button
              ref={keepRef}
              type="button"
              class={BUTTON}
              onClick={() => setConfirmDelete(false)}
            >
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

export function ContractFormPage({ slug, id }: { slug?: string; id?: string }) {
  const state = useBusinessRepo();
  // One form (and id) per page visit, so a failed save and a retry write the same files.
  const [fresh] = useState(() => (id ? null : emptyContractForm(todayLocal())));
  return (
    <PageShell state={state} title={id ? 'Edit contract' : 'New contract'}>
      {({ repo, data }) => {
        const client = data.clients.find((c) => c.slug === slug);
        if (!client) {
          return (
            <p class="text-xs">
              No client <code>{slug}</code>.{' '}
              <a href="/clients" class="text-[var(--los-accent)] hover:underline">
                Back to clients
              </a>
            </p>
          );
        }
        const existing = id
          ? data.contracts.find((c) => c.client === client.slug && c.id === id)
          : undefined;
        if (id && !existing) {
          return (
            <p class="text-xs">
              No contract <code>{id}</code>.{' '}
              <a href={`/clients/${client.slug}`} class="text-[var(--los-accent)] hover:underline">
                Back to {client.name}
              </a>
            </p>
          );
        }
        const start = existing ? contractFormFromContract(existing) : (fresh as ContractForm);
        return (
          <ContractEditor
            target={repo}
            data={data}
            client={client.slug}
            start={start}
            existing={existing}
          />
        );
      }}
    </PageShell>
  );
}
