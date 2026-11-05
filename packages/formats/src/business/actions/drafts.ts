import type { Slug, Ulid } from '../ids.js';
import type { TextChanges } from '../issue.js';
import { draftPath } from '../paths.js';
import {
  type BusinessProfile,
  type Draft,
  KEY_ORDER,
  type Line,
  type Project,
  type TimeEntry,
  type VatCategory,
} from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateDraft } from '../validate.js';
import type { Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

/**
 * The one draft writer. It creates `drafts/<id>.yaml` or replaces that draft; a draft that was
 * already issued is refused, so an issued document is never touched from here.
 */
export const saveDraft = (
  repo: BusinessRepo,
  draft: Draft,
): Result<{ changes: TextChanges; message: string }> => {
  if (!repo.clients.some((c) => c.slug === draft.client)) {
    return { ok: false, issues: [{ path: 'client', message: `unknown client "${draft.client}"` }] };
  }
  if (repo.issued.some((i) => i.doc.draft_id === draft.id)) {
    return { ok: false, issues: [{ path: 'id', message: 'This draft was already issued.' }] };
  }
  const checked = validateDraft(draft);
  if (!checked.ok) return checked;
  return {
    ok: true,
    value: {
      changes: { [draftPath(draft.id)]: stringifyYaml(checked.value, KEY_ORDER.draft) },
      message: `business: save draft ${draft.id} for ${draft.client}`,
    },
  };
};

const refuse = (path: string, message: string) => ({
  ok: false as const,
  issues: [{ path, message }],
});

/** Integer `value / divisor` rounded half up, as a decimal string with 2 places; no floats touch quantities. */
const twoPlaces = (value: number, divisor: number): string => {
  // A booked minute is never billed as nothing: the smallest quantity is 0.01.
  const hundredths = Math.max(
    value > 0 ? 1 : 0,
    Math.floor((value * 200 + divisor) / (divisor * 2)),
  );
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
};

/** Small-business sellers charge no VAT: category E at 0 (what the `de` rules require); otherwise S at the profile rate. */
export const defaultVat = (
  profile: Pick<BusinessProfile, 'vat_regime' | 'default_vat_rate'>,
): { vat_category: VatCategory; vat_rate: string } =>
  profile.vat_regime === 'small-business'
    ? { vat_category: 'E', vat_rate: '0' }
    : { vat_category: 'S', vat_rate: profile.default_vat_rate };

const WITHOUT_RATE = 'Time without rate — set a price';

/**
 * An invoice draft from unbilled time (entries with no `invoice`): one line per project that has a
 * rate (hours for `hour`, minutes/480 days for `day`), and one zero-price line for the rest.
 * `entryIds` narrows to those entries, `project` to one project.
 */
export const draftFromUnbilled = (
  repo: BusinessRepo,
  client: Slug,
  opts: { project?: Slug; entryIds?: Ulid[] },
  id: Ulid,
  _today: string,
): Result<Draft> => {
  // Time already in a draft is not offered again, unless the caller names the entries.
  const drafted = new Set(repo.drafts.flatMap((d) => d.time_entries ?? []));
  const unbilled = repo.time.filter(
    (t) =>
      t.client === client &&
      t.invoice === undefined &&
      (opts.project === undefined || t.project === opts.project) &&
      (opts.entryIds === undefined || opts.entryIds.includes(t.id)),
  );
  const entries = opts.entryIds ? unbilled : unbilled.filter((t) => !drafted.has(t.id));
  if (entries.length === 0) {
    return refuse(
      'time_entries',
      unbilled.length > 0
        ? 'All unbilled time is already in a draft.'
        : 'There is no unbilled time to invoice.',
    );
  }
  if (!repo.profile) return refuse('profile', 'Set up the business profile first.');
  const vat = defaultVat(repo.profile);

  const byProject = new Map<string, TimeEntry[]>();
  const unrated: TimeEntry[] = [];
  for (const e of entries) {
    const project = repo.projects.find((p) => p.client === client && p.slug === e.project);
    if (!project?.rate) {
      unrated.push(e);
      continue;
    }
    byProject.set(project.slug, [...(byProject.get(project.slug) ?? []), e]);
  }
  const sum = (list: TimeEntry[]) => list.reduce((n, e) => n + e.minutes, 0);
  const lines: Line[] = [];
  for (const [slug, list] of byProject) {
    const project = repo.projects.find((p) => p.client === client && p.slug === slug);
    if (!project?.rate) continue;
    const daily = project.rate.per === 'day';
    lines.push({
      description: project.name,
      quantity: twoPlaces(sum(list), daily ? 480 : 60),
      unit: daily ? 'DAY' : 'HUR',
      unit_price: project.rate.amount,
      ...vat,
    });
  }
  if (unrated.length > 0) {
    lines.push({
      description: WITHOUT_RATE,
      quantity: twoPlaces(sum(unrated), 60),
      unit: 'HUR',
      unit_price: 0,
      ...vat,
    });
  }
  const dates = entries.map((e) => e.date).sort();
  const projects = new Set(entries.map((e) => e.project));
  const only = [...projects][0];
  return validateDraft({
    id,
    kind: 'invoice',
    client,
    ...(projects.size === 1 && only ? { project: only } : {}),
    service_period: { start: dates[0], end: dates[dates.length - 1] },
    lines,
    time_entries: entries.map((e) => e.id),
  });
};

const DAY_MS = 86_400_000;
const utc = (date: string): Date => new Date(`${date}T00:00:00Z`);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** `date` plus whole months, the day clamped to the target month's length (31 Nov-30 → 28 Feb). */
export const addMonths = (date: string, months: number): string => {
  const d = utc(date);
  const target = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), target + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(d.getUTCFullYear(), target, Math.min(d.getUTCDate(), lastDay))));
};

/**
 * The invoice draft for the retainer period that starts at `next_date`. Monthly: up to the last
 * day of that month. Quarterly: up to the day before `next_date` plus three months.
 */
export const draftFromRetainer = (
  repo: BusinessRepo,
  project: Project,
  id: Ulid,
  _today: string,
): Result<Draft> => {
  const retainer = project.retainer;
  if (!retainer) return refuse('retainer', `${project.name} has no retainer.`);
  if (!repo.profile) return refuse('profile', 'Set up the business profile first.');
  const start = retainer.next_date;
  const end =
    retainer.interval === 'monthly'
      ? iso(new Date(Date.UTC(utc(start).getUTCFullYear(), utc(start).getUTCMonth() + 1, 0)))
      : iso(new Date(utc(addMonths(start, 3)).getTime() - DAY_MS));
  return validateDraft({
    id,
    kind: 'invoice',
    client: project.client,
    project: project.slug,
    service_period: { start, end },
    from_retainer: start,
    lines: [
      {
        description: retainer.description,
        quantity: '1',
        unit: 'C62',
        unit_price: retainer.amount,
        ...defaultVat(repo.profile),
      },
    ],
  });
};

/** Removes `drafts/<id>.yaml`. An issued draft is refused: issuing already removes it, and a stale view must not resurrect the question. */
export const deleteDraft = (
  repo: BusinessRepo,
  id: Ulid,
): Result<{ changes: TextChanges; message: string }> => {
  if (repo.issued.some((i) => i.doc.draft_id === id)) {
    return refuse('id', 'This draft was already issued.');
  }
  const draft = repo.drafts.find((d) => d.id === id);
  if (!draft) return refuse('id', 'This draft does not exist any more.');
  return {
    ok: true,
    value: {
      changes: { [draftPath(id)]: null },
      message: `business: delete draft ${id} for ${draft.client}`,
    },
  };
};
