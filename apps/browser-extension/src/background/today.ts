/**
 * The start page's view of the repo's own data: events, todos, habits, time tracking, world clocks
 * and the read-it-later list.
 *
 * Every file is read and written with the console widgets' own code (packages/formats); this module
 * only decides what the start page shows from it.
 */

import {
  braindumpCreatedAt,
  braindumpIdOf,
  braindumpTitle,
  calculateStats,
  getUpcomingEvents,
  ideaSlugOf,
  isCheckedIn,
  localDate,
  parseEvents,
  parseHabitData,
  parseReadItLater,
  parseTimeTracking,
  parseTimezones,
  parseTodos,
  type ReadItLaterItem,
  type TodoItem,
} from '@kaihuman/formats';
import { CACHE_TTL_MS } from './bookmarks';
import { STATUS_CONFIG_PATH } from './service-status';

/** Files whose content the start page reads. Action logs are only written to, so only listed. */
export const TODAY_SUFFIXES = [
  '.todos.md',
  '.events.csv',
  '.habit.csv',
  '.timetracking.csv',
  '.timezones.json',
  '.readitlater.json',
] as const;

const ACTION_LOG_SUFFIX = '.actionlog.md';

/** Where the log box writes when the repo has no action log yet — the worker's own default. */
export const DEFAULT_ACTION_LOG_PATH = '.lifeos/dump.actionlog.md';

export interface TodayFile {
  path: string;
  sha: string;
  content: string;
}

export interface TodayCache {
  repo: string;
  /** `.kh`, or `.lifeos` in repos from before the rename — the console resolves it the same way. */
  appFolder: string;
  actionLogPaths: string[];
  files: TodayFile[];
  /** The tree listing's ETag, so an unchanged repo answers 304 and no file is read at all. */
  etag: string | null;
  fetchedAt: number;
}

export const isTodayCacheUsable = (cache: TodayCache | undefined, repo: string) =>
  cache?.repo === repo && Array.isArray(cache.files);

export const isTodayCacheStale = (cache: TodayCache, now = Date.now()) =>
  now - cache.fetchedAt > CACHE_TTL_MS;

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
}

/**
 * The files the start page reads: its widgets' kinds, the braindumps (doc/braindump.md), and the
 * list of services whose status it shows — which rides along so it costs no request of its own.
 * The palette's ideas (`>id`, doc/ideas.md) ride along too; the start page itself shows none.
 */
const isTodayPath = (path: string) => {
  const lower = path.toLowerCase();
  return (
    TODAY_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ||
    braindumpIdOf(path) !== null ||
    ideaSlugOf(path) !== null ||
    path === STATUS_CONFIG_PATH
  );
};

export function appFolderOf(tree: { path: string }[]): string {
  if (tree.some((entry) => entry.path.startsWith('.kh/'))) return '.kh';
  if (tree.some((entry) => entry.path.startsWith('.lifeos/'))) return '.lifeos';
  return '.kh';
}

const githubHeaders = (token: string, accept = 'application/vnd.github+json') => ({
  Authorization: `Bearer ${token}`,
  Accept: accept,
});

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/**
 * One tree listing, replayed with its ETag, then a read only for files whose blob changed since
 * the last sync. An hour in which nothing changed costs one 304, which GitHub does not bill.
 */
export async function fetchToday(
  token: string,
  repo: string,
  previous: TodayCache | undefined,
): Promise<TodayCache> {
  const known = isTodayCacheUsable(previous, repo) ? previous : undefined;
  const headers: Record<string, string> = githubHeaders(token);
  if (known?.etag) headers['If-None-Match'] = known.etag;

  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers,
  });
  if (response.status === 304 && known) return { ...known, fetchedAt: Date.now() };
  // An empty repository has no HEAD to list.
  if (response.status === 404 || response.status === 409) {
    return {
      repo,
      appFolder: '.kh',
      actionLogPaths: [],
      files: [],
      etag: null,
      fetchedAt: Date.now(),
    };
  }
  if (!response.ok) throw new Error(`Could not list ${repo}: ${response.status}`);

  const { tree = [] } = (await response.json()) as { tree?: TreeEntry[] };
  const blobs = tree.filter((entry) => entry.type === 'blob');
  const byPath = new Map((known?.files ?? []).map((file) => [file.path, file]));

  const files = await Promise.all(
    blobs
      .filter((entry) => isTodayPath(entry.path))
      .map(async (entry): Promise<TodayFile> => {
        const cached = byPath.get(entry.path);
        if (cached?.sha === entry.sha) return cached;
        const read = await fetch(
          `https://api.github.com/repos/${repo}/contents/${encodePath(entry.path)}`,
          { headers: githubHeaders(token, 'application/vnd.github.raw+json') },
        );
        if (!read.ok) throw new Error(`Could not read ${entry.path}: ${read.status}`);
        return { path: entry.path, sha: entry.sha, content: await read.text() };
      }),
  );

  return {
    repo,
    appFolder: appFolderOf(blobs),
    actionLogPaths: blobs
      .filter((entry) => entry.path.toLowerCase().endsWith(ACTION_LOG_SUFFIX))
      .map((entry) => entry.path),
    files,
    etag: response.headers?.get('etag') ?? null,
    fetchedAt: Date.now(),
  };
}

/** The cache after a delete: the file is gone from it, and the tree ETag with it. */
export function withoutFile(cache: TodayCache, path: string): TodayCache {
  return { ...cache, files: cache.files.filter((file) => file.path !== path), etag: null };
}

/** The cache after a commit: the written file replaces (or joins) what was cached. */
export function withFile(cache: TodayCache, file: TodayFile): TodayCache {
  const rest = cache.files.filter((candidate) => candidate.path !== file.path);
  // The commit moved HEAD, so the old tree ETag no longer describes it.
  return { ...cache, files: [...rest, file], etag: null };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const parseLocalDate = (iso: string): Date | null => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: Date, to: Date) => {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
};

const minutesOf = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** `projects.todos.md` → `projects`: the name the console gives a file's widget. */
export const fileLabel = (path: string) => {
  const name = path.split('/').pop() ?? path;
  return name.slice(0, name.indexOf('.') > 0 ? name.indexOf('.') : undefined);
};

// ─── Events (.events.csv) ───────────────────────────────────────────────────

export interface UpcomingEvent {
  name: string;
  type: string;
  /** The next occurrence — this year's or next year's for a birthday. */
  date: string;
  daysUntil: number;
  path: string;
}

/** How far ahead the start page looks. */
export const EVENTS_HORIZON_DAYS = 7;

export function upcomingEvents(path: string, csv: string, now: Date): UpcomingEvent[] {
  return getUpcomingEvents(parseEvents(csv), Number.POSITIVE_INFINITY, now)
    .filter((upcoming) => upcoming.daysUntil <= EVENTS_HORIZON_DAYS)
    .map(({ entry, date, daysUntil }) => ({
      name: entry.name,
      type: entry.type,
      date: localDate(date),
      // A multi-day event that started before today is still running: it is on today.
      daysUntil: Math.max(0, daysUntil),
      path,
    }));
}

// ─── Todos (.todos.md) ──────────────────────────────────────────────────────

const isOpen = (todo: TodoItem) => todo.status === 'backlog' || todo.status === 'in-progress';

// ─── Habits (.habit.csv) ────────────────────────────────────────────────────

/** How many days the start page's strip shows, today included. */
export const HABIT_WEEK_DAYS = 7;

/** Whether the goal was reached on each of the last seven days, the oldest first. */
export function habitWeek(csv: string, now: Date): boolean[] {
  const reached = new Set(
    parseHabitData(csv)
      .entries.filter((entry) => entry.reached)
      .map((entry) => entry.date),
  );
  return Array.from({ length: HABIT_WEEK_DAYS }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    day.setDate(day.getDate() - (HABIT_WEEK_DAYS - 1 - index));
    return reached.has(localDate(day));
  });
}

// ─── Time tracking (.timetracking.csv) ──────────────────────────────────────

export interface TimerState {
  running: boolean;
  /** Minutes in today's closed intervals; the page adds the running one as the clock ticks. */
  closedMinutes: number;
  /** `HH:MM` the running interval started at. */
  runningSince?: string;
}

export function timerState(csv: string, now: Date): TimerState {
  const today = parseTimeTracking(csv).entries.find((entry) => entry.date === localDate(now));
  if (!today) return { running: false, closedMinutes: 0 };
  let closedMinutes = 0;
  for (const interval of today.intervals) {
    if (interval.end)
      closedMinutes += Math.max(0, minutesOf(interval.end) - minutesOf(interval.start));
  }
  const last = today.intervals.at(-1);
  return last && !last.end
    ? { running: true, closedMinutes, runningSince: last.start }
    : { running: false, closedMinutes };
}

// ─── World clocks (.timezones.json) ─────────────────────────────────────────

export interface Clock {
  /** IANA zone, which `Intl` turns into a local time without a library. */
  zone: string;
  label: string;
}

/** One clock per zone in the list, labelled by its first city. */
export function worldClocks(json: string): Clock[] {
  return parseTimezones(json).timezones.flatMap((entry) => {
    if (typeof entry.name !== 'string' || !entry.name) return [];
    const city =
      Array.isArray(entry.cities) && typeof entry.cities[0] === 'string' ? entry.cities[0] : '';
    return [{ zone: entry.name, label: city || entry.name.split('/').pop() || entry.name }];
  });
}

// ─── Read it later (.readitlater.json) ──────────────────────────────────────

export const unreadItems = (json: string): ReadItLaterItem[] =>
  parseReadItLater(json).items.filter(
    (item) => item?.status === 'new' && typeof item.url === 'string',
  );

// ─── The summary the start page shows ───────────────────────────────────────

export interface TodaySummary {
  events: UpcomingEvent[];
  inProgress: { text: string; path: string }[];
  /** Open todos whose milestone is already due. */
  overdue: { text: string; path: string; milestone: string }[];
  milestone?: { name: string; dueDate: string; daysUntil: number; open: number; path: string };
  inbox: { path: string; count: number };
  readLater: (Pick<ReadItLaterItem, 'id' | 'url' | 'name' | 'createdAt'> & { path: string })[];
  /** Every unread item, where `readLater` is cut to the oldest few. */
  unreadCount: number;
  habits: {
    path: string;
    name: string;
    checkedToday: boolean;
    streak: number;
    /** The last seven days, the oldest first — today is the last. */
    week: boolean[];
  }[];
  timers: ({ path: string; name: string } & TimerState)[];
  clocks: Clock[];
  actionLogPath: string;
  /** The newest braindumps first, cut to the newest few; `sha` is what a delete must name. */
  braindumps: { path: string; sha: string; title: string; text: string; createdAt: number }[];
  braindumpCount: number;
  fetchedAt: number;
}

const LIST_LIMIT = 5;
const READ_LATER_LIMIT = 3;
const BRAINDUMP_LIMIT = 10;

/** The inbox the console's quick-todo page writes to. */
export const inboxPath = (cache: Pick<TodayCache, 'appFolder'>) =>
  `${cache.appFolder}/inbox.todos.md`;

/** Where a page saved for later goes: the first list the repo has, or a new one. */
export const readLaterPath = (cache: TodayCache) =>
  cache.files.find((file) => file.path.toLowerCase().endsWith('.readitlater.json'))?.path ??
  `${cache.appFolder}/reading.readitlater.json`;

/** The first action log, preferring the app folder's own — the log box has one target. */
export const actionLogPath = (cache: TodayCache) =>
  cache.actionLogPaths.find((path) => path.startsWith(`${cache.appFolder}/`)) ??
  cache.actionLogPaths[0] ??
  DEFAULT_ACTION_LOG_PATH;

export function buildToday(cache: TodayCache, now: Date): TodaySummary {
  const summary: TodaySummary = {
    events: [],
    inProgress: [],
    overdue: [],
    inbox: { path: inboxPath(cache), count: 0 },
    readLater: [],
    unreadCount: 0,
    habits: [],
    timers: [],
    clocks: [],
    actionLogPath: actionLogPath(cache),
    braindumps: [],
    braindumpCount: 0,
    fetchedAt: cache.fetchedAt,
  };
  const today = localDate(now);
  const files = [...cache.files].sort((a, b) => a.path.localeCompare(b.path));

  for (const { path, sha, content } of files) {
    const lower = path.toLowerCase();
    const braindump = braindumpIdOf(path);
    if (braindump) {
      summary.braindumps.push({
        path,
        sha,
        title: braindumpTitle(content),
        text: content,
        createdAt: braindumpCreatedAt(braindump),
      });
    } else if (lower.endsWith('.events.csv')) {
      summary.events.push(...upcomingEvents(path, content, now));
    } else if (lower.endsWith('.todos.md')) {
      const { items: todos, milestones } = parseTodos(content);
      if (path === summary.inbox.path) {
        summary.inbox.count = todos.filter((todo) => todo.status === 'backlog').length;
      }
      for (const todo of todos) {
        if (todo.status === 'in-progress') summary.inProgress.push({ text: todo.text, path });
      }
      for (const milestone of milestones) {
        if (!milestone.dueDate) continue;
        const open = todos.filter((todo) => todo.milestoneId === milestone.id && isOpen(todo));
        if (milestone.dueDate < today) {
          for (const todo of open) {
            summary.overdue.push({ text: todo.text, path, milestone: milestone.name });
          }
        } else if (!summary.milestone || milestone.dueDate < summary.milestone.dueDate) {
          const due = parseLocalDate(milestone.dueDate);
          summary.milestone = {
            name: milestone.name,
            dueDate: milestone.dueDate,
            daysUntil: due ? daysBetween(now, due) : 0,
            open: open.length,
            path,
          };
        }
      }
    } else if (lower.endsWith('.habit.csv')) {
      summary.habits.push({
        path,
        name: fileLabel(path),
        checkedToday: isCheckedIn(content, today),
        streak: calculateStats(parseHabitData(content), now).currentStreak,
        week: habitWeek(content, now),
      });
    } else if (lower.endsWith('.timetracking.csv')) {
      summary.timers.push({ path, name: fileLabel(path), ...timerState(content, now) });
    } else if (lower.endsWith('.timezones.json')) {
      summary.clocks.push(...worldClocks(content));
    } else if (lower.endsWith('.readitlater.json')) {
      for (const item of unreadItems(content)) {
        const { id, url, name, createdAt } = item;
        summary.readLater.push({
          id,
          url,
          name: name || url,
          createdAt: Number(createdAt) || 0,
          path,
        });
      }
    }
  }

  summary.events.sort((a, b) => a.daysUntil - b.daysUntil);
  summary.events = summary.events.slice(0, LIST_LIMIT);
  summary.inProgress = summary.inProgress.slice(0, LIST_LIMIT);
  summary.overdue = summary.overdue.slice(0, LIST_LIMIT);
  // The oldest first: they are the ones the list is for.
  summary.unreadCount = summary.readLater.length;
  summary.readLater.sort((a, b) => a.createdAt - b.createdAt);
  summary.readLater = summary.readLater.slice(0, READ_LATER_LIMIT);
  summary.braindumpCount = summary.braindumps.length;
  summary.braindumps.sort((a, b) => b.createdAt - a.createdAt);
  summary.braindumps = summary.braindumps.slice(0, BRAINDUMP_LIMIT);
  return summary;
}
