import {
  type BusinessRepo,
  logTime,
  timePath,
  timerToEntry,
  ulid,
} from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { PRIMARY } from '../components/business/buttons';
import { INPUT } from '../components/business/FormField';
import { PageShell } from '../components/business/PageShell';
import { todayLocal } from '../lib/business/dates';
import {
  emptyTimeForm,
  entryFromForm,
  formFromEntry,
  HOURS_HINT,
  type TimeForm,
  timeFieldErrors,
} from '../lib/business/time-form';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

type Query = { client?: string; project?: string; from?: string };

type Initial = {
  form: TimeForm;
  stopping: boolean;
  /** `started_at` of the timer the form was prefilled from; stopping must still find that timer. */
  timerStart: string | null;
};

function initialForm(data: BusinessRepo, query: Query): Initial {
  if (query.from === 'timer' && data.timer) {
    return {
      form: formFromEntry(timerToEntry(data.timer, new Date())),
      stopping: true,
      timerStart: data.timer.started_at,
    };
  }
  return {
    timerStart: null,
    form: {
      ...emptyTimeForm(todayLocal()),
      client: query.client ?? '',
      project: query.project ?? '',
    },
    stopping: false,
  };
}

function LogTimeForm(props: { target: KBRepo; data: BusinessRepo; query: Query }) {
  const { target, data, query } = props;
  const [init] = useState(() => initialForm(data, query));
  const { stopping, timerStart } = init;
  const [form, setForm] = useState<TimeForm>(init.form);
  const [errors, setErrors] = useState<Partial<Record<keyof TimeForm, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set synchronously: `busy` only changes after the next render, so two quick submits could both pass.
  const submitting = useRef(false);

  const set = <K extends keyof TimeForm>(key: K, value: TimeForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  // Archived projects take no new time, but a prefilled one stays selectable.
  const projects = data.projects.filter(
    (p) => p.client === form.client && (p.status === 'active' || p.slug === form.project),
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.current) return;
    const entry = entryFromForm(form);
    setErrors(timeFieldErrors(entry));
    if (!entry.ok) {
      setError('Some fields need attention.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    const id = ulid();
    try {
      const result = await writeBusiness(target, async (fresh) => {
        // The timer may have been stopped on another device; logging again would double the entry.
        if (stopping && !fresh.repo.timer) {
          return {
            ok: false,
            issues: [{ path: 'timer', message: 'The timer was already stopped elsewhere.' }],
          };
        }
        // Stopped and restarted elsewhere: this form's minutes belong to the old timer.
        if (stopping && fresh.repo.timer?.started_at !== timerStart) {
          return {
            ok: false,
            issues: [
              {
                path: 'timer',
                message: 'The timer changed on another device. Reload and check.',
              },
            ],
          };
        }
        const file = timePath(entry.value.date.slice(0, 7));
        return logTime(fresh.repo, { [file]: (await fresh.read(file)) ?? '' }, entry.value, {
          id,
          stopTimer: stopping,
        });
      });
      if (!result.ok) {
        setErrors(timeFieldErrors(result));
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      route(`/clients/${entry.value.client}`);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const label = 'block text-xs text-[var(--los-fg-dim)] mb-1';
  const err = (key: keyof TimeForm) =>
    errors[key] && (
      <p id={`${key}-error`} class="text-xs text-[var(--los-warning)] mt-1">
        {errors[key]}
      </p>
    );
  const a11y = (key: keyof TimeForm) => ({
    'aria-invalid': errors[key] ? (true as const) : undefined,
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
  });

  return (
    <form onSubmit={handleSubmit} noValidate class="max-w-xl space-y-3">
      {stopping && (
        <p class="text-xs text-[var(--los-muted)]">
          Timer stopped. Check the time, date and note, then save; the timer is removed with it.
        </p>
      )}
      <div>
        <label for="client" class={label}>
          Client
        </label>
        <select
          id="client"
          class={INPUT}
          value={form.client}
          disabled={busy}
          {...a11y('client')}
          onChange={(e) => {
            set('client', (e.target as HTMLSelectElement).value);
            set('project', '');
          }}
        >
          <option value="">Choose…</option>
          {data.clients.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        {err('client')}
      </div>
      <div>
        <label for="project" class={label}>
          Project (optional)
        </label>
        <select
          id="project"
          class={INPUT}
          value={form.project}
          disabled={busy || projects.length === 0}
          {...a11y('project')}
          onChange={(e) => set('project', (e.target as HTMLSelectElement).value)}
        >
          <option value="">None</option>
          {projects.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        {err('project')}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="date" class={label}>
            Date
          </label>
          <input
            id="date"
            type="date"
            class={INPUT}
            value={form.date}
            disabled={busy}
            {...a11y('date')}
            onInput={(e) => set('date', (e.target as HTMLInputElement).value)}
          />
          {err('date')}
        </div>
        <div>
          <label for="hours" class={label}>
            Hours
          </label>
          <input
            id="hours"
            type="text"
            inputMode="text"
            class={INPUT}
            value={form.hours}
            disabled={busy}
            {...a11y('hours')}
            onInput={(e) => set('hours', (e.target as HTMLInputElement).value)}
          />
          {err('hours') || <p class="text-[10px] text-[var(--los-fg-dim)] mt-1">{HOURS_HINT}</p>}
        </div>
      </div>
      <div>
        <label for="note" class={label}>
          Note
        </label>
        <input
          id="note"
          type="text"
          class={INPUT}
          value={form.note}
          disabled={busy}
          {...a11y('note')}
          onInput={(e) => set('note', (e.target as HTMLInputElement).value)}
        />
        {err('note')}
      </div>
      <button type="submit" disabled={busy} class={PRIMARY}>
        {busy ? 'Saving...' : 'Save time'}
      </button>
      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}

export function LogTimePage(props: Query) {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Log time">
      {({ repo, data }) => <LogTimeForm target={repo} data={data} query={props} />}
    </PageShell>
  );
}
