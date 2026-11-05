import { asSlug, type Result, type TimeEntry } from '@kaihuman/formats/business';
import { isRealDate } from './dates';

export type TimeForm = {
  client: string;
  project: string;
  date: string;
  /** `1.5`, `1,5`, `1:30` or `90m`. */
  hours: string;
  note: string;
};

export const emptyTimeForm = (date: string): TimeForm => ({
  client: '',
  project: '',
  date,
  hours: '',
  note: '',
});

export const HOURS_HINT = 'Use 1.5, 1:30 or 90m.';

/** Minutes for the hours field, or `null` when it is not one of the accepted shapes. */
export function parseHours(input: string): number | null {
  const s = input.trim().toLowerCase();
  const clock = s.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const decimal = (text: string | undefined) => Number((text ?? '').replace(',', '.'));
  const mins = s.match(/^(\d+(?:[.,]\d+)?)\s*m(?:in)?$/);
  if (mins) return Math.round(decimal(mins[1]));
  const hrs = s.match(/^(\d+(?:[.,]\d+)?)\s*h?$/);
  if (hrs) return Math.round(decimal(hrs[1]) * 60);
  return null;
}

type Errors = Partial<Record<keyof TimeForm, string>>;

/** Validates the form into a time entry (without id). Issues use the form's field names as paths. */
export function entryFromForm(form: TimeForm): Result<Omit<TimeEntry, 'id'>> {
  const issues: { path: keyof TimeForm; message: string }[] = [];
  const client = asSlug(form.client.trim());
  if (!client) issues.push({ path: 'client', message: 'Choose a client.' });
  const projectText = form.project.trim();
  const project = projectText ? asSlug(projectText) : null;
  if (projectText && !project) issues.push({ path: 'project', message: 'Choose a valid project.' });
  if (!isRealDate(form.date)) {
    issues.push({ path: 'date', message: 'Enter a date as YYYY-MM-DD.' });
  }
  const minutes = parseHours(form.hours);
  if (minutes === null) issues.push({ path: 'hours', message: `Not a duration. ${HOURS_HINT}` });
  else if (minutes < 1) issues.push({ path: 'hours', message: 'Time must be at least 1 minute.' });
  else if (minutes > 1440) issues.push({ path: 'hours', message: 'At most 24 hours per entry.' });
  const note = form.note.trim();
  if (!note) issues.push({ path: 'note', message: 'Add a short note on what you did.' });
  if (issues.length > 0 || !client || minutes === null) return { ok: false, issues };
  return {
    ok: true,
    value: {
      date: form.date,
      minutes,
      client,
      ...(project ? { project } : {}),
      note,
    },
  };
}

/** First message per form field. */
export function timeFieldErrors(result: Result<unknown>): Errors {
  const errors: Errors = {};
  if (result.ok) return errors;
  for (const issue of result.issues) {
    const field = issue.path as keyof TimeForm;
    if (field in EMPTY_KEYS && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
const EMPTY_KEYS: Record<keyof TimeForm, true> = {
  client: true,
  project: true,
  date: true,
  hours: true,
  note: true,
};

/** Prefill from a stopped timer; minutes show as `H:MM`. */
export function formFromEntry(entry: Omit<TimeEntry, 'id'>): TimeForm {
  const h = Math.floor(entry.minutes / 60);
  const m = String(entry.minutes % 60).padStart(2, '0');
  return {
    client: entry.client,
    project: entry.project ?? '',
    date: entry.date,
    hours: `${h}:${m}`,
    note: entry.note,
  };
}
