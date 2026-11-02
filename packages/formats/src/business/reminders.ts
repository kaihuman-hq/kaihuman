import { addMonths } from './actions/drafts.js';
import { jurisdictionFor } from './jurisdiction.js';
import type { Contract, Project } from './records.js';
import type { BusinessRepo } from './repo.js';

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * The last day a record dated `date` must be kept: 31 Dec of its year plus the jurisdiction's
 * retention years. Without a profile the longer generic period applies, so nothing is let go early.
 */
export const retentionEnd = (repo: BusinessRepo, date: string): string =>
  `${Number(date.slice(0, 4)) + jurisdictionFor(repo.profile?.jurisdiction ?? 'generic').retentionYears}-12-31`;

/** The `next_date` after this period: one or three months on, the day clamped to the month end. */
export const nextRetainerDate = (retainer: NonNullable<Project['retainer']>): string =>
  addMonths(retainer.next_date, retainer.interval === 'monthly' ? 1 : 3);

export type RetainerDue = { project: Project; date: string; hasDraft: boolean };

/**
 * Retainers whose `next_date` is at most `windowDays` away, overdue ones included, by date.
 * `hasDraft`: a draft for that project already bills that period.
 */
export const retainersDue = (repo: BusinessRepo, today: string, windowDays = 14): RetainerDue[] => {
  const until = addDays(today, windowDays);
  return repo.projects
    .flatMap((project) => {
      const date = project.retainer?.next_date;
      if (date === undefined || date > until) return [];
      const hasDraft = repo.drafts.some(
        (d) =>
          d.client === project.client && d.project === project.slug && d.from_retainer === date,
      );
      return [{ project, date, hasDraft }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
};

export type ContractDate = { date: string; what: 'renewal' | 'notice' | 'end' };

/** Every reminder date of a contract; notice is due `notice_period_days` before the renewal, else the end. */
export const contractDates = (c: Contract): ContractDate[] => {
  const out: ContractDate[] = [];
  if (c.renewal_date !== undefined) out.push({ date: c.renewal_date, what: 'renewal' });
  const until = c.renewal_date ?? c.end;
  if (until !== undefined && c.notice_period_days !== undefined) {
    out.push({ date: addDays(until, -c.notice_period_days), what: 'notice' });
  }
  if (c.end !== undefined) out.push({ date: c.end, what: 'end' });
  return out;
};

/** Contract dates from `today` to `today + windowDays`, both included, by date. */
export const contractReminders = (
  repo: BusinessRepo,
  today: string,
  windowDays = 60,
): ({ contract: Contract } & ContractDate)[] => {
  const until = addDays(today, windowDays);
  return repo.contracts
    .flatMap((contract) => contractDates(contract).map((d) => ({ contract, ...d })))
    .filter((d) => d.date >= today && d.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date));
};
