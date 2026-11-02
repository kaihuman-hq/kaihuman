import {
  type BusinessRepo,
  DOC_KINDS,
  type DocKind,
  type Draft,
  deleteDraft,
  draftFromRetainer,
  draftFromUnbilled,
  type Slug,
  saveDraft,
  type Ulid,
  ulid,
} from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { a11y, Field, INPUT } from '../components/business/FormField';
import { LinesEditor } from '../components/business/LinesEditor';
import { PageShell } from '../components/business/PageShell';
import { addDays, todayLocal } from '../lib/business/dates';
import {
  type DraftForm,
  draftFieldErrors,
  draftFromForm,
  emptyDraftForm,
  formFromDraft,
  unsupportedCategories,
} from '../lib/business/draft-form';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

type Props = {
  id?: string;
  client?: string;
  kind?: string;
  from?: string;
  project?: string;
};

const OFFER_VALID_DAYS = 30;
const back = (path: string, text: string) => (
  <a href={path} class="text-[var(--los-accent)] hover:underline">
    {text}
  </a>
);
const message = (text: string, link: preact.ComponentChildren) => (
  <p class="text-xs" role="alert">
    {text} {link}
  </p>
);

/** `/business/drafts/new` without a client: pick one, then continue with the query the other links use. */
function ClientChooser({ data }: { data: BusinessRepo }) {
  const [client, setClient] = useState(data.clients[0]?.slug ?? '');
  const [kind, setKind] = useState('invoice');
  return (
    <form
      class="max-w-xl space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (client) route(`/business/drafts/new?client=${client}&kind=${kind}`);
      }}
    >
      <Field id="chooser-client" label="Client">
        <select
          id="chooser-client"
          class={INPUT}
          value={client}
          onChange={(e) => setClient((e.target as HTMLSelectElement).value)}
        >
          {data.clients.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="chooser-kind" label="Document">
        <select
          id="chooser-kind"
          class={INPUT}
          value={kind}
          onChange={(e) => setKind((e.target as HTMLSelectElement).value)}
        >
          <option value="invoice">Invoice</option>
          <option value="offer">Offer</option>
        </select>
      </Field>
      <button
        type="submit"
        disabled={!client}
        class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
      >
        Start draft
      </button>
    </form>
  );
}

/** The draft the editor starts from: an existing one, a builder's, or an empty one. */
function startingDraft(
  data: BusinessRepo,
  props: Props,
  newId: Ulid,
): { draft: Draft; form: DraftForm } | { error: string } {
  const currency = data.profile?.currency ?? 'EUR';
  if (props.id) {
    const existing = data.drafts.find((d) => d.id === props.id);
    if (!existing) return { error: `No draft ${props.id}.` };
    return { draft: existing, form: formFromDraft(existing, currency) };
  }
  const client = data.clients.find((c) => c.slug === props.client);
  if (!client) return { error: `No client ${props.client ?? ''}.` };
  const today = todayLocal();
  if (props.from === 'unbilled') {
    const r = draftFromUnbilled(
      data,
      client.slug,
      props.project ? { project: props.project as Slug } : {},
      newId,
      today,
    );
    if (!r.ok) return { error: r.issues[0]?.message ?? 'Nothing to invoice.' };
    return { draft: r.value, form: formFromDraft(r.value, currency) };
  }
  if (props.from === 'retainer') {
    const project = data.projects.find((p) => p.client === client.slug && p.slug === props.project);
    if (!project) return { error: `No project ${props.project ?? ''}.` };
    const r = draftFromRetainer(data, project, newId, today);
    if (!r.ok) return { error: r.issues[0]?.message ?? 'No retainer.' };
    return { draft: r.value, form: formFromDraft(r.value, currency) };
  }
  const kind = DOC_KINDS.find((k) => k === props.kind && k !== 'credit-note') ?? 'invoice';
  const rate = data.profile?.default_vat_rate ?? '19';
  return {
    draft: { id: newId, kind, client: client.slug, lines: [] },
    form: emptyDraftForm(kind, rate, addDays(today, OFFER_VALID_DAYS)),
  };
}

const KIND_LABEL: Record<DocKind, string> = {
  invoice: 'Invoice draft',
  offer: 'Offer draft',
  'credit-note': 'Credit note draft',
};

function DraftEditor(props: {
  target: KBRepo;
  data: BusinessRepo;
  start: { draft: Draft; form: DraftForm };
  exists: boolean;
}) {
  const { target, data, start, exists } = props;
  const base = start.draft;
  const currency = base.currency ?? data.profile?.currency ?? 'EUR';
  const [form, setForm] = useState<DraftForm>(start.form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set synchronously: `busy` only changes after the next render.
  const submitting = useRef(false);
  const projects = data.projects.filter((p) => p.client === base.client);
  const clientPage = `/clients/${base.client}`;

  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Runs one guarded write; `onDone` is called after a successful commit. */
  async function act(
    build: (fresh: { repo: BusinessRepo }) => ReturnType<typeof saveDraft>,
    onDone: () => void,
  ) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await writeBusiness(target, async (fresh) => build(fresh));
      if (!result.ok) {
        setErrors(draftFieldErrors(result));
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      onDone();
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function save(then: string) {
    if (submitting.current) return;
    const draft = draftFromForm(form, base);
    setErrors(draftFieldErrors(draft));
    if (!draft.ok) {
      setError('Some fields need attention.');
      return;
    }
    await act(
      (fresh) => saveDraft(fresh.repo, draft.value),
      () => route(then),
    );
  }

  async function remove() {
    await act(
      (fresh) => deleteDraft(fresh.repo, base.id),
      () => route(clientPage),
    );
  }

  const unsupported = unsupportedCategories(data.profile, base.kind);
  const button =
    'px-4 py-2 text-sm rounded disabled:opacity-50 border border-[var(--los-border)] hover:opacity-90';

  return (
    <form
      noValidate
      class="max-w-3xl space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(clientPage);
      }}
    >
      <p class="text-xs">
        {KIND_LABEL[base.kind]} for {back(clientPage, base.client)}
        {base.corrects && <> correcting {base.corrects}</>}
        {base.from_offer && <> from offer {base.from_offer}</>}
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="project" label="Project (optional)" error={errors.project}>
          <select
            id="project"
            class={INPUT}
            value={form.project}
            disabled={busy}
            onChange={(e) => set('project', (e.target as HTMLSelectElement).value)}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {base.kind === 'offer' && (
          <Field id="valid-until" label="Valid until" error={errors.valid_until}>
            <input
              id="valid-until"
              type="date"
              class={INPUT}
              value={form.validUntil}
              disabled={busy}
              {...a11y('valid-until', errors.valid_until)}
              onInput={(e) => set('validUntil', (e.target as HTMLInputElement).value)}
            />
          </Field>
        )}
      </div>
      {base.kind !== 'offer' && (
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="service-start" label="Service period start" error={errors.service_period}>
            <input
              id="service-start"
              type="date"
              class={INPUT}
              value={form.serviceStart}
              disabled={busy}
              {...a11y('service-start', errors.service_period)}
              onInput={(e) => set('serviceStart', (e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field id="service-end" label="Service period end">
            <input
              id="service-end"
              type="date"
              class={INPUT}
              value={form.serviceEnd}
              disabled={busy}
              onInput={(e) => set('serviceEnd', (e.target as HTMLInputElement).value)}
            />
          </Field>
        </div>
      )}
      <LinesEditor
        lines={form.lines}
        onChange={(lines) => set('lines', lines)}
        errors={errors}
        currency={currency}
        defaultVatRate={data.profile?.default_vat_rate ?? '19'}
        disabled={busy}
        unsupported={unsupported}
      />
      <Field id="notes" label="Notes (optional)" error={errors.notes}>
        <textarea
          id="notes"
          class={INPUT}
          rows={3}
          value={form.notes}
          disabled={busy}
          onInput={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        />
      </Field>
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save draft'}
        </button>
        <button
          type="button"
          disabled={busy}
          class={button}
          onClick={() => save(`/business/drafts/${base.id}/issue`)}
        >
          Issue…
        </button>
        {exists && !confirmDelete && (
          <button
            type="button"
            disabled={busy}
            class={button}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
      {confirmDelete && (
        <p role="alert" class="text-xs text-[var(--los-warning)] flex flex-wrap items-center gap-2">
          Delete this draft? This cannot be undone.
          <button type="button" disabled={busy} class={button} onClick={remove}>
            Yes, delete draft
          </button>
          <button
            type="button"
            disabled={busy}
            class={button}
            onClick={() => setConfirmDelete(false)}
          >
            Keep it
          </button>
        </p>
      )}
      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}

export function DraftPage(props: Props) {
  const state = useBusinessRepo();
  // One id per page visit, so a failed save and a retry write the same file.
  const [newId] = useState(() => ulid());
  return (
    <PageShell state={state} title="Draft">
      {({ repo, data }) => {
        if (data.issued.some((i) => i.doc.draft_id === props.id)) {
          return message('This draft was already issued.', back('/business', 'Back to business'));
        }
        if (!props.id && !props.client) return <ClientChooser data={data} />;
        const start = startingDraft(data, props, newId);
        if ('error' in start) return message(start.error, back('/business', 'Back to business'));
        return (
          // Keyed so moving between drafts never reuses another draft's form state.
          <DraftEditor
            key={start.draft.id}
            target={repo}
            data={data}
            start={start}
            exists={data.drafts.some((d) => d.id === start.draft.id)}
          />
        );
      }}
    </PageShell>
  );
}
