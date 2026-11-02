import { localDate } from '../../dates.js';
import { asSlug, type Slug, type Ulid } from '../ids.js';
import type { FileChanges } from '../issue.js';
import { appendJsonl } from '../jsonl.js';
import { TIMER_PATH, timePath } from '../paths.js';
import { KEY_ORDER, type RunningTimer, type TimeEntry } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateTimeEntry, validateTimer } from '../validate.js';
import type { Issue, Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

type Action = Result<{ changes: FileChanges; message: string }>;

const refuse = (path: string, message: string): { ok: false; issues: Issue[] } => ({
  ok: false,
  issues: [{ path, message }],
});

/** Starts the one running timer; `now` is written as an ISO instant with `Z`. */
export const startTimer = (
  repo: BusinessRepo,
  input: { client: string; project?: string; note?: string },
  now: Date,
): Action => {
  if (repo.timer) return refuse('timer', `A timer is already running for ${repo.timer.client}.`);
  const client = asSlug(input.client);
  if (!client || !repo.clients.some((c) => c.slug === client)) {
    return refuse('client', `unknown client "${input.client}"`);
  }
  let project: Slug | undefined;
  if (input.project) {
    project = asSlug(input.project) ?? undefined;
    if (!project || !repo.projects.some((p) => p.client === client && p.slug === project)) {
      return refuse('project', `unknown project "${input.project}" of client "${client}"`);
    }
  }
  const note = input.note?.trim();
  const timer: RunningTimer = {
    client,
    ...(project ? { project } : {}),
    started_at: now.toISOString(),
    ...(note ? { note } : {}),
  };
  const checked = validateTimer(timer);
  if (!checked.ok) return checked;
  return {
    ok: true,
    value: {
      changes: { [TIMER_PATH]: stringifyYaml(timer, KEY_ORDER.timer) },
      message: `business: start timer for ${client}`,
    },
  };
};

/**
 * The entry a stopped timer becomes: dated on the local day it started (a run past midnight
 * stays on its start day) and clamped to 1...1440 minutes, so a forgotten timer can be fixed in the form.
 */
export const timerToEntry = (timer: RunningTimer, now: Date): Omit<TimeEntry, 'id'> => {
  const started = new Date(timer.started_at);
  const minutes = Math.min(
    1440,
    Math.max(1, Math.round((now.getTime() - started.getTime()) / 60000)),
  );
  return {
    date: localDate(started),
    minutes,
    client: timer.client,
    ...(timer.project ? { project: timer.project } : {}),
    note: timer.note ?? '',
  };
};

/** Appends the entry to its month file; `stopTimer` deletes the running timer in the same change set. */
export const logTime = (
  repo: BusinessRepo,
  timeFiles: Readonly<Record<string, string>>,
  entry: Omit<TimeEntry, 'id'>,
  opts: { id: Ulid; stopTimer?: boolean },
): Action => {
  if (!repo.clients.some((c) => c.slug === entry.client)) {
    return refuse('client', `unknown client "${entry.client}"`);
  }
  if (
    entry.project &&
    !repo.projects.some((p) => p.client === entry.client && p.slug === entry.project)
  ) {
    return refuse('project', `unknown project "${entry.project}" of client "${entry.client}"`);
  }
  const full: TimeEntry = { id: opts.id, ...entry, note: entry.note.trim() };
  const checked = validateTimeEntry(full);
  if (!checked.ok) return checked;
  const file = timePath(entry.date.slice(0, 7));
  const changes: FileChanges = {
    [file]: appendJsonl(timeFiles[file] ?? '', checked.value, KEY_ORDER.time),
  };
  if (opts.stopTimer) changes[TIMER_PATH] = null;
  return {
    ok: true,
    value: {
      changes,
      message: `business: log ${Math.max(0.1, Math.round(entry.minutes / 6) / 10).toFixed(1)} h for ${entry.client}`,
    },
  };
};

export const cancelTimer = (_repo: BusinessRepo): Action => ({
  ok: true,
  value: { changes: { [TIMER_PATH]: null }, message: 'business: cancel timer' },
});
