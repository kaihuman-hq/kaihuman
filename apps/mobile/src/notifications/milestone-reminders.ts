import { type Milestone, parseEvents, parseTodos, type TodoData } from '@kaihuman/formats';

export type ReminderKind = 'milestone-eve' | 'milestone-due' | 'milestone-overdue' | 'event';

/** A local notification to schedule. `fireAt` is Unix ms; `id` is stable across recomputation. */
export interface ReminderSchedule {
  id: string;
  kind: ReminderKind;
  title: string;
  body: string;
  fireAt: number;
}

export interface ReminderOptions {
  /** Local hour at which day-based milestone reminders fire. */
  milestoneHour?: number;
  /** Events carry only dates, so they are assumed to start at this local hour. */
  eventStartHour?: number;
  /** Minutes before the assumed event start. */
  eventLeadMinutes?: number;
}

const DEFAULTS: Required<ReminderOptions> = {
  milestoneHour: 9,
  eventStartHour: 9,
  eventLeadMinutes: 60,
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local-time midnight-based date; undefined for anything that is not a real YYYY-MM-DD. */
const localDate = (iso: string, hour: number): Date | undefined => {
  const m = DATE_RE.exec(iso);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, hour);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date : undefined;
};

const localIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hasOpenItems = (data: TodoData, milestoneId: string): boolean =>
  data.items.some(
    (i) => i.milestoneId === milestoneId && (i.status === 'backlog' || i.status === 'in-progress'),
  );

/**
 * Milestones with no open items are finished and stay silent. Upcoming ones remind at
 * `milestoneHour` the day before and on the due day; overdue ones remind immediately (`now`).
 */
export const planMilestoneReminders = (
  data: TodoData,
  now: Date,
  options: ReminderOptions = {},
): ReminderSchedule[] => {
  const { milestoneHour } = { ...DEFAULTS, ...options };
  const out: ReminderSchedule[] = [];
  const today = localIso(now);

  for (const m of data.milestones as Milestone[]) {
    if (!m.dueDate || !hasOpenItems(data, m.id)) continue;
    const due = localDate(m.dueDate, milestoneHour);
    if (!due) continue;

    if (m.dueDate < today) {
      out.push({
        id: `milestone:${m.id}:overdue`,
        kind: 'milestone-overdue',
        title: `Overdue: ${m.name}`,
        body: `Was due ${m.dueDate}`,
        fireAt: now.getTime(),
      });
      continue;
    }
    const eve = new Date(due);
    eve.setDate(eve.getDate() - 1);
    const candidates: ReminderSchedule[] = [
      {
        id: `milestone:${m.id}:eve`,
        kind: 'milestone-eve',
        title: `Due tomorrow: ${m.name}`,
        body: `Due ${m.dueDate}`,
        fireAt: eve.getTime(),
      },
      {
        id: `milestone:${m.id}:due`,
        kind: 'milestone-due',
        title: `Due today: ${m.name}`,
        body: `Due ${m.dueDate}`,
        fireAt: due.getTime(),
      },
    ];
    out.push(...candidates.filter((c) => c.fireAt > now.getTime()));
  }
  return out;
};

/** Birthdays recur yearly, so they roll to the next occurrence; other events fire once. */
export const planEventReminders = (
  csv: string,
  now: Date,
  options: ReminderOptions = {},
): ReminderSchedule[] => {
  const { eventStartHour, eventLeadMinutes } = { ...DEFAULTS, ...options };
  const out: ReminderSchedule[] = [];

  for (const e of parseEvents(csv).entries) {
    let start = localDate(e.startDate, eventStartHour);
    if (!start) continue;
    if (e.type === 'birthday') {
      while (start.getTime() <= now.getTime()) {
        start = new Date(
          start.getFullYear() + 1,
          start.getMonth(),
          start.getDate(),
          eventStartHour,
        );
      }
    }
    if (start.getTime() <= now.getTime()) continue; // already started: nothing left to announce
    const lead = start.getTime() - eventLeadMinutes * 60_000;
    out.push({
      id: `event:${e.type}:${e.name}:${localIso(start)}`,
      kind: 'event',
      title: e.name,
      body: eventLeadMinutes > 0 ? `Starts in ${eventLeadMinutes} min` : 'Starting now',
      fireAt: Math.max(lead, now.getTime()),
    });
  }
  return out;
};

export interface ReminderSources {
  /** Raw `.todos.md` file contents (every todos file in the repo). */
  todos?: string[];
  /** Raw `.events.csv` content. */
  events?: string;
}

/** Deduped by id (first wins), sorted by fire time then id, so output is deterministic. */
export const planReminders = (
  sources: ReminderSources,
  now: Date,
  options: ReminderOptions = {},
): ReminderSchedule[] => {
  const all = [
    ...(sources.todos ?? []).flatMap((md) => planMilestoneReminders(parseTodos(md), now, options)),
    ...planEventReminders(sources.events ?? '', now, options),
  ];
  const byId = new Map<string, ReminderSchedule>();
  for (const r of all) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.fireAt - b.fireAt || (a.id < b.id ? -1 : 1));
};
