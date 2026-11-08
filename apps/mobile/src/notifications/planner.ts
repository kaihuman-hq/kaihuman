export type NotificationKind =
  | 'due-today'
  | 'due-soon'
  | 'overdue'
  | 'milestone-tomorrow'
  | 'digest';

export interface PlannerTodo {
  id: string;
  text: string;
  status: 'backlog' | 'in-progress' | 'done' | 'rejected';
  /** YYYY-MM-DD */
  dueDate?: string;
  /** HH:MM, wall time in the planner's `tz` */
  dueTime?: string;
}

export interface PlannerMilestone {
  id: string;
  name: string;
  dueDate?: string;
  /** Open item count. */
  open: number;
}

export interface NotificationSettings {
  enabled: boolean;
  digest: boolean;
  /** HH:MM */
  morningTime: string;
  minutesBefore: number;
  kinds: { dueToday: boolean; dueSoon: boolean; overdue: boolean; milestoneTomorrow: boolean };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  digest: true,
  morningTime: '09:00',
  minutesBefore: 15,
  kinds: { dueToday: true, dueSoon: true, overdue: true, milestoneTomorrow: true },
};

export interface PlannedNotification {
  id: string;
  kind: NotificationKind;
  /** Unix ms. */
  fireAt: number;
  title: string;
  body: string;
  todoId?: string;
  /** Deep link. */
  url: string;
}

/** iOS keeps at most 64 pending local notifications; the nearest win. */
export const IOS_PENDING_LIMIT = 64;

const HORIZON_DAYS = 7;
const MINUTE = 60_000;
const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (tz: string): Intl.DateTimeFormat => {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
};

/** The tz wall clock at `ms`, expressed as if it were UTC. */
const wallAsUtc = (ms: number, tz: string): number => {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return Date.UTC(
    p.year ?? 0,
    (p.month ?? 1) - 1,
    p.day ?? 1,
    p.hour ?? 0,
    p.minute ?? 0,
    p.second ?? 0,
  );
};

const offsetAt = (ms: number, tz: string): number =>
  wallAsUtc(Math.floor(ms / 1000) * 1000, tz) - Math.floor(ms / 1000) * 1000;

const pad = (n: number): string => String(n).padStart(2, '0');

export function localDate(ms: number, tz: string): string {
  const d = new Date(wallAsUtc(ms, tz));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const addDays = (date: string, days: number): string => {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const r = new Date(Date.UTC(y, m - 1, d + days));
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`;
};

export function zonedTime(date: string, time: string, tz: string): number {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Offsets a day either side bracket any single transition around `wall`.
  const before = offsetAt(wall - DAY, tz);
  const after = offsetAt(wall + DAY, tz);
  const valid = [...new Set([before, after])]
    .map((o) => wall - o)
    .filter((candidate) => offsetAt(candidate, tz) === wall - candidate)
    .sort((a, b) => a - b);
  // In a DST gap no candidate round-trips; the pre-gap offset moves the time forward by the gap.
  return valid[0] ?? wall - before;
}

export function notificationSignature(n: PlannedNotification): string {
  return JSON.stringify([n.kind, n.fireAt, n.title, n.body, n.todoId ?? null, n.url]);
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const listTexts = (texts: string[]): string => texts.slice(0, 3).join(', ');
const BOARD = 'kaihuman://board';
const itemUrl = (id: string): string => `${BOARD}?item=${encodeURIComponent(id)}`;

export function planNotifications(
  todos: PlannerTodo[],
  milestones: PlannerMilestone[],
  settings: NotificationSettings,
  now: number,
  tz: string,
  limit = IOS_PENDING_LIMIT,
): PlannedNotification[] {
  if (!settings.enabled) return [];

  const today = localDate(now, tz);
  const lastDay = addDays(today, HORIZON_DAYS);
  const inHorizon = (date: string): boolean => date >= today && date <= lastDay;
  const morning = (date: string): number => zonedTime(date, settings.morningTime, tz);
  const open = todos
    .filter((t) => t.status === 'backlog' || t.status === 'in-progress')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const out: PlannedNotification[] = [];
  const push = (n: PlannedNotification): void => {
    if (n.fireAt > now) out.push(n);
  };

  const overdue: PlannerTodo[] = [];
  const byDay = new Map<string, PlannerTodo[]>();

  for (const t of open) {
    if (!t.dueDate) continue;
    const due = t.dueTime ? zonedTime(t.dueDate, t.dueTime, tz) : undefined;
    const isOverdue = due === undefined ? t.dueDate < today : due <= now;
    if (isOverdue) {
      overdue.push(t);
      continue;
    }
    if (!inHorizon(t.dueDate)) continue;
    byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t]);

    if (due === undefined) {
      if (settings.kinds.dueToday) {
        push({
          id: `kh:due-today:${t.id}`,
          kind: 'due-today',
          fireAt: morning(t.dueDate),
          title: 'Due today',
          body: t.text,
          todoId: t.id,
          url: itemUrl(t.id),
        });
      }
    } else if (settings.kinds.dueSoon) {
      push({
        id: `kh:due-soon:${t.id}`,
        kind: 'due-soon',
        fireAt: due - settings.minutesBefore * MINUTE,
        title: `Due at ${t.dueTime}`,
        body: t.text,
        todoId: t.id,
        url: itemUrl(t.id),
      });
    }
  }

  if (settings.kinds.overdue && overdue.length > 0) {
    const todayMorning = morning(today);
    const date = todayMorning > now ? today : addDays(today, 1);
    const more = overdue.length - 3;
    push({
      id: `kh:overdue:${date}`,
      kind: 'overdue',
      fireAt: date === today ? todayMorning : morning(date),
      title: `${plural(overdue.length, 'overdue todo', 'overdue todos')}`,
      body: listTexts(overdue.map((t) => t.text)) + (more > 0 ? ` +${more} more` : ''),
      url: BOARD,
    });
  }

  if (settings.kinds.milestoneTomorrow) {
    for (const m of [...milestones].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      if (!m.dueDate || m.open <= 0) continue;
      const day = addDays(m.dueDate, -1);
      if (!inHorizon(day)) continue;
      push({
        id: `kh:milestone-tomorrow:${m.id}`,
        kind: 'milestone-tomorrow',
        fireAt: morning(day),
        title: `Due tomorrow: ${m.name}`,
        body: plural(m.open, 'open todo', 'open todos'),
        url: `${BOARD}?milestone=${encodeURIComponent(m.id)}`,
      });
    }
  }

  if (settings.digest) {
    for (const [date, list] of byDay) {
      push({
        id: `kh:digest:${date}`,
        kind: 'digest',
        fireAt: morning(date),
        title: `${plural(list.length, 'todo', 'todos')} due today`,
        body: listTexts(list.map((t) => t.text)),
        url: BOARD,
      });
    }
  }

  out.sort((a, b) => a.fireAt - b.fireAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.slice(0, limit);
}
