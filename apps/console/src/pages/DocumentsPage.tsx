import { demoMode } from '@kaihuman/core';
import {
  asSlug,
  type BusinessProfile,
  LETTERHEADS,
  PAPERS,
  PRINT_FONTS,
} from '@kaihuman/formats/business';
import { useState } from 'preact/hooks';
import { route } from 'preact-router';
import { PRIMARY, SECONDARY } from '../components/business/buttons';
import { Card } from '../components/business/Card';
import { a11y, Field, INPUT } from '../components/business/FormField';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { todayLocal } from '../lib/business/dates';
import {
  documentSummaries,
  newDocumentChanges,
  type PrintForm,
  printFormOf,
  printFromForm,
  printSettingsChanges,
} from '../lib/business/documents';
import { BUSINESS_PROFILE_PATH } from '../lib/business/load';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const LINK = 'text-[var(--los-accent)] hover:underline';
const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';

function NewDocument({ target }: { target: KBRepo }) {
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  async function create(e: Event) {
    e.preventDefault();
    const s = asSlug(slug.trim());
    if (!s) {
      setError('Use lowercase letters, digits and dashes, 2-40 characters.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const r = await writeBusiness(target, async (fresh) => {
        const changes = newDocumentChanges(fresh.repo, s, todayLocal());
        return changes.ok
          ? { ok: true, value: { changes: changes.value, message: `Business: new document ${s}` } }
          : changes;
      });
      if (r.ok) route(`/business/documents/${s}`);
      else setError(r.issues[0]?.message);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={create} class="flex flex-wrap items-end gap-2">
      <div class="min-w-48">
        <Field
          id="doc-slug"
          label="New document from a sample"
          hint="File name: documents/<name>.md"
          error={error}
          alert
        >
          <input
            id="doc-slug"
            class={INPUT}
            value={slug}
            placeholder="offer-acme"
            onInput={(e) => setSlug(e.currentTarget.value)}
            {...a11y('doc-slug', error)}
          />
        </Field>
      </div>
      <button type="submit" class={SECONDARY} disabled={busy || demoMode.value}>
        Create
      </button>
    </form>
  );
}

const SELECTS: {
  key: 'letterhead' | 'paper' | 'font';
  label: string;
  options: readonly string[];
}[] = [
  { key: 'letterhead', label: 'Letterhead', options: LETTERHEADS },
  { key: 'paper', label: 'Paper', options: PAPERS },
  { key: 'font', label: 'Font', options: PRINT_FONTS },
];
const TEXTS: { key: 'accent' | 'website' | 'logo' | 'bank_name'; label: string; hint: string }[] = [
  { key: 'accent', label: 'Accent colour', hint: 'e.g. #0b6cf0' },
  { key: 'website', label: 'Website', hint: 'Printed in the footer.' },
  { key: 'logo', label: 'Logo', hint: 'SVG or PNG in the business folder, e.g. assets/logo.svg' },
  { key: 'bank_name', label: 'Bank name', hint: 'Printed beside IBAN and BIC.' },
];

/** The `print:` settings of business.yaml: what every document's letterhead looks like. */
function PrintSettingsForm({ target, profile }: { target: KBRepo; profile: BusinessProfile }) {
  const [form, setForm] = useState<PrintForm>(() => printFormOf(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof PrintForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: Event) {
    e.preventDefault();
    const checked = printFromForm(profile, form);
    if (!checked.ok) {
      setErrors(
        Object.fromEntries(checked.issues.map((i) => [i.path.replace(/^print\./, ''), i.message])),
      );
      return;
    }
    setErrors({});
    setBusy(true);
    setStatus(null);
    try {
      const r = await writeBusiness(target, async (fresh) => {
        const text = await fresh.read(BUSINESS_PROFILE_PATH);
        if (text === null) {
          return { ok: false, issues: [{ path: '', message: 'business.yaml is missing.' }] };
        }
        const changes = printSettingsChanges(text, checked.value);
        return changes.ok
          ? { ok: true, value: { changes: changes.value, message: 'Business: print settings' } }
          : changes;
      });
      setStatus(r.ok ? 'Saved.' : (r.issues[0]?.message ?? 'Nothing was saved.'));
    } catch (err) {
      setStatus(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} class="space-y-3">
      <p class="text-xs text-[var(--los-fg-dim)]">
        Sender, address, VAT id and bank come from your business profile. These settings only change
        how documents look.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SELECTS.map(({ key, label, options }) => (
          <Field key={key} id={`print-${key}`} label={label} error={errors[key]}>
            <select
              id={`print-${key}`}
              class={INPUT}
              value={form[key]}
              onChange={(e) => set(key, e.currentTarget.value)}
              {...a11y(`print-${key}`, errors[key])}
            >
              <option value="">Default</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEXTS.map(({ key, label, hint }) => (
          <Field key={key} id={`print-${key}`} label={label} hint={hint} error={errors[key]}>
            <input
              id={`print-${key}`}
              class={INPUT}
              value={form[key]}
              onInput={(e) => set(key, e.currentTarget.value)}
              {...a11y(`print-${key}`, errors[key])}
            />
          </Field>
        ))}
      </div>
      <div class="flex items-center gap-3">
        <button type="submit" class={PRIMARY} disabled={busy || demoMode.value}>
          Save print settings
        </button>
        {status && (
          <output class="text-xs" aria-live="polite">
            {status}
          </output>
        )}
      </div>
    </form>
  );
}

export function DocumentsPage() {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Documents" section="/business/documents">
      {({ data, contents, repo: target, loadErrors }) => {
        const docs = documentSummaries(data, contents);
        return (
          <>
            <p class="text-xs text-[var(--los-fg-dim)]">
              Offers and letters as Markdown in <code>documents/</code>. Write the content; the
              console lays it out and prints it to PDF in the browser.
            </p>
            <Card title="Documents">
              {docs.length === 0 ? (
                <p class="text-xs text-[var(--los-muted)]">No documents yet.</p>
              ) : (
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr>
                        <th class={th}>Document</th>
                        <th class={th}>Subject</th>
                        <th class={th}>Client</th>
                        <th class={th}>Template</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.slug}>
                          <td class={td}>
                            <a href={`/business/documents/${d.slug}`} class={LINK}>
                              {d.slug}
                            </a>
                          </td>
                          <td class={td}>{d.subject ?? '-'}</td>
                          <td class={td}>{d.client ?? '-'}</td>
                          <td class={td}>{d.template ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div class="mt-3">
                <NewDocument target={target} />
              </div>
            </Card>
            {data.profile && (
              <Card title="Print settings">
                <PrintSettingsForm target={target} profile={data.profile} />
              </Card>
            )}
            <ProblemsList findings={data.findings} loadErrors={loadErrors} />
          </>
        );
      }}
    </PageShell>
  );
}
