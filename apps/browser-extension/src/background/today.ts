/**
 * The start page's view of the repo's own data: events, todos, habits, time tracking, world clocks
 * and the read-it-later list.
 *
 * The file formats are the console widgets' (packages/ui/src/LifeOS/Organisms/Widgets/*Logic.ts).
 * Only the part the start page needs is mirrored here, and every write touches the file as little
 * as it can — a todo is appended rather than the whole file re-serialized — so nothing the console
 * wrote is lost to a parser that knows less than the console's.
 */

import { CACHE_TTL_MS } from './bookmarks';

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

const isTodayPath = (path: string) => {
  const lower = path.toLowerCase();
  return TODAY_SUFFIXES.some((suffix) => lower.endsWith(suffix));
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

/** The cache after a commit: the written file replaces (or joins) what was cached. */
export function withFile(cache: TodayCache, file: TodayFile): TodayCache {
  const rest = cache.files.filter((candidate) => candidate.path !== file.path);
  // The commit moved HEAD, so the old tree ETag no longer describes it.
  return { ...cache, files: [...rest, file], etag: null };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar day — the console's widgets all count days in local time. */
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

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
  const upcoming: UpcomingEvent[] = [];
  for (const line of csv.trim().split(/\r?\n/)) {
    const [name, type, start, end] = line.split(';').map((part) => part.trim());
    if (!name || !type || !start || line.toLowerCase().startsWith('name;')) continue;
    const kind = type.toLowerCase();
    const startDate = parseLocalDate(start);
    if (!startDate) continue;

    let next = startDate;
    if (kind === 'birthday') {
      next = new Date(now.getFullYear(), startDate.getMonth(), startDate.getDate());
      if (daysBetween(now, next) < 0) next.setFullYear(now.getFullYear() + 1);
    } else {
      // A multi-day event still running today is still worth seeing.
      const endDate = parseLocalDate(end || start) ?? startDate;
      if (daysBetween(now, endDate) < 0) continue;
    }

    const daysUntil = Math.max(0, daysBetween(now, next));
    if (daysUntil > EVENTS_HORIZON_DAYS) continue;
    upcoming.push({ name, type: kind, date: localDate(next), daysUntil, path });
  }
  return upcoming;
}

// ─── Todos (.todos.md) ──────────────────────────────────────────────────────

export interface TodoLine {
  text: string;
  status: 'backlog' | 'in-progress' | 'done' | 'rejected';
  milestoneId?: string;
}

export interface Milestone {
  id: string;
  name: string;
  dueDate?: string;
}

const MARKER_TO_STATUS: Record<string, TodoLine['status']> = {
  ' ': 'backlog',
  '>': 'in-progress',
  x: 'done',
  X: 'done',
  '-': 'rejected',
};

/** The front matter's milestones; the console writes them in exactly this shape. */
export function parseMilestones(md: string): Milestone[] {
  if (!md.startsWith('---')) return [];
  const close = md.indexOf('\n---', 3);
  if (close === -1) return [];
  const milestones: Milestone[] = [];
  let current: Partial<Milestone> | null = null;
  const flush = () => {
    if (current?.id && current.name) milestones.push(current as Milestone);
  };
  for (const line of md.slice(3, close).split('\n')) {
    const id = line.match(/^\s{2}-\s+id:\s*(.+)/)?.[1];
    if (id) {
      flush();
      current = { id: id.trim() };
      continue;
    }
    const name = line.match(/^\s{4}name:\s*(.+)/)?.[1];
    if (name && current) current.name = name.trim();
    const due = line.match(/^\s{4}dueDate:\s*(.+)/)?.[1];
    if (due && current) current.dueDate = due.trim();
  }
  flush();
  return milestones;
}

export function parseTodoLines(md: string): TodoLine[] {
  const todos: TodoLine[] = [];
  for (const line of md.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[([^\]]*)\]\s+(.*)/);
    if (!match) continue;
    let milestoneId: string | undefined;
    const text = (match[2] ?? '')
      .replace(/^\d{4}-\d{2}-\d{2}T\S+Z\s+/, '')
      .replace(/#[\w-]+/g, '')
      .replace(/!([\w-]+)/g, (_, id: string) => {
        milestoneId = id;
        return '';
      })
      .replace(/\s+/g, ' ')
      .trim();
    todos.push({ text, status: MARKER_TO_STATUS[match[1] ?? ' '] ?? 'backlog', milestoneId });
  }
  return todos;
}

const isOpen = (todo: TodoLine) => todo.status === 'backlog' || todo.status === 'in-progress';

// Shared with the palette, which adds todos to any `.todos.md` the same way.
export { appendTodo } from '@lifosy/palette';

// ─── Habits (.habit.csv) ────────────────────────────────────────────────────

const HABIT_HEADER = 'iso date;goal reached';

const reachedDates = (csv: string) =>
  new Set(
    csv
      .split(/\r?\n/)
      .map((line) => line.split(';'))
      .filter(([date, reached]) => date && /^\d{4}-/.test(date) && reached?.trim() === 'x')
      .map(([date]) => (date ?? '').trim()),
  );

/** Days in a row the goal was reached, counting back from today — or from yesterday, not yet lost. */
export function habitStreak(csv: string, now: Date): number {
  const reached = reachedDates(csv);
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!reached.has(localDate(day))) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (reached.has(localDate(day))) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

export const isCheckedIn = (csv: string, date: string) => reachedDates(csv).has(date);

/** Marks `date` reached and writes the file the way the console's habit widget does. */
export function checkInHabit(csv: string, date: string): string {
  const entries = new Map<string, boolean>();
  for (const line of csv.trim().split(/\r?\n/)) {
    const [day, reached] = line.split(';');
    if (!day || reached === undefined || line.includes('iso date')) continue;
    entries.set(day.trim(), reached.trim() === 'x');
  }
  entries.set(date, true);
  const lines = [...entries]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, reached]) => `${day};${reached ? 'x' : ''}`);
  return [HABIT_HEADER, ...lines].join('\n');
}

// ─── Time tracking (.timetracking.csv) ──────────────────────────────────────

interface Interval {
  start: string;
  end?: string;
}

interface DayEntry {
  date: string;
  intervals: Interval[];
}

function parseTimeTracking(csv: string): DayEntry[] {
  const entries: DayEntry[] = [];
  for (const raw of csv.trim().split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.toLowerCase().startsWith('iso')) continue;
    const [date, times] = line.split(';');
    if (!date || !times) continue;
    const stamps = times.split(',').filter((t) => t.trim() !== '');
    const intervals: Interval[] = [];
    for (let i = 0; i < stamps.length; i += 2) {
      intervals.push({ start: stamps[i] as string, end: stamps[i + 1] });
    }
    entries.push({ date, intervals });
  }
  return entries;
}

function serializeTimeTracking(entries: DayEntry[]): string {
  const rows = [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => {
      const times = entry.intervals.flatMap((i) => (i.end ? [i.start, i.end] : [i.start]));
      return `${entry.date};${times.join(',')}\n`;
    });
  return `iso date;time\n${rows.join('')}`;
}

export interface TimerState {
  running: boolean;
  /** Minutes in today's closed intervals; the page adds the running one as the clock ticks. */
  closedMinutes: number;
  /** `HH:MM` the running interval started at. */
  runningSince?: string;
}

export function timerState(csv: string, now: Date): TimerState {
  const today = parseTimeTracking(csv).find((entry) => entry.date === localDate(now));
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

/** Starts or stops today's timer, exactly as the console's start/stop button does. */
export function toggleTimer(csv: string, now: Date): string {
  const entries = parseTimeTracking(csv);
  const date = localDate(now);
  const hm = localTime(now);
  const today = entries.find((entry) => entry.date === date);
  if (!today) {
    entries.push({ date, intervals: [{ start: hm }] });
  } else {
    const last = today.intervals.at(-1);
    if (last && !last.end) last.end = hm;
    else today.intervals.push({ start: hm });
  }
  return serializeTimeTracking(entries);
}

// ─── World clocks (.timezones.json) ─────────────────────────────────────────

export interface Clock {
  /** IANA zone, which `Intl` turns into a local time without a library. */
  zone: string;
  label: string;
}

export function parseClocks(json: string): Clock[] {
  try {
    const data = JSON.parse(json) as { timezones?: { name?: unknown; cities?: unknown }[] };
    if (!Array.isArray(data.timezones)) return [];
    return data.timezones.flatMap((entry) => {
      if (typeof entry.name !== 'string' || !entry.name) return [];
      const cities = Array.isArray(entry.cities) ? entry.cities : [];
      const city = typeof cities[0] === 'string' ? cities[0] : '';
      return [{ zone: entry.name, label: city || entry.name.split('/').pop() || entry.name }];
    });
  } catch {
    return [];
  }
}

// ─── Read it later (.readitlater.json) ──────────────────────────────────────

export interface ReadLaterItem {
  id: string;
  url: string;
  name: string;
  status: 'new' | 'read';
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

function parseReadLater(json: string): { items: ReadLaterItem[] } & Record<string, unknown> {
  if (!json.trim()) return { items: [] };
  const data = JSON.parse(json);
  return { ...data, items: Array.isArray(data?.items) ? data.items : [] };
}

export function unreadItems(json: string): ReadLaterItem[] {
  try {
    return parseReadLater(json).items.filter(
      (item) => item?.status === 'new' && typeof item.url === 'string',
    );
  } catch {
    return [];
  }
}

export function markRead(json: string, id: string, now: number): string {
  const data = parseReadLater(json);
  if (!data.items.some((item) => item.id === id)) {
    throw new Error('That item is no longer on the list');
  }
  const items = data.items.map((item) =>
    item.id === id ? { ...item, status: 'read' as const, updatedAt: now } : item,
  );
  return JSON.stringify({ ...data, items }, null, 2);
}

export function addReadLater(
  json: string,
  page: { url: string; title: string },
  now: number,
  id: string,
): string {
  const data = parseReadLater(json);
  if (data.items.some((item) => item.url === page.url && item.status === 'new')) {
    throw new Error('Already on the read-later list');
  }
  const item: ReadLaterItem = {
    id,
    url: page.url,
    name: page.title.trim() || page.url,
    status: 'new',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  return JSON.stringify({ ...data, items: [...data.items, item] }, null, 2);
}

// ─── The summary the start page shows ───────────────────────────────────────

export interface TodaySummary {
  events: UpcomingEvent[];
  inProgress: { text: string; path: string }[];
  /** Open todos whose milestone is already due. */
  overdue: { text: string; path: string; milestone: string }[];
  milestone?: { name: string; dueDate: string; daysUntil: number; open: number; path: string };
  inbox: { path: string; count: number };
  readLater: (Pick<ReadLaterItem, 'id' | 'url' | 'name' | 'createdAt'> & { path: string })[];
  habits: { path: string; name: string; checkedToday: boolean; streak: number }[];
  timers: ({ path: string; name: string } & TimerState)[];
  clocks: Clock[];
  actionLogPath: string;
  fetchedAt: number;
}

const LIST_LIMIT = 5;
const READ_LATER_LIMIT = 3;

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
    habits: [],
    timers: [],
    clocks: [],
    actionLogPath: actionLogPath(cache),
    fetchedAt: cache.fetchedAt,
  };
  const today = localDate(now);
  const files = [...cache.files].sort((a, b) => a.path.localeCompare(b.path));

  for (const { path, content } of files) {
    const lower = path.toLowerCase();
    if (lower.endsWith('.events.csv')) {
      summary.events.push(...upcomingEvents(path, content, now));
    } else if (lower.endsWith('.todos.md')) {
      const todos = parseTodoLines(content);
      if (path === summary.inbox.path) {
        summary.inbox.count = todos.filter((todo) => todo.status === 'backlog').length;
      }
      for (const todo of todos) {
        if (todo.status === 'in-progress') summary.inProgress.push({ text: todo.text, path });
      }
      for (const milestone of parseMilestones(content)) {
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
        streak: habitStreak(content, now),
      });
    } else if (lower.endsWith('.timetracking.csv')) {
      summary.timers.push({ path, name: fileLabel(path), ...timerState(content, now) });
    } else if (lower.endsWith('.timezones.json')) {
      summary.clocks.push(...parseClocks(content));
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
  summary.readLater.sort((a, b) => a.createdAt - b.createdAt);
  summary.readLater = summary.readLater.slice(0, READ_LATER_LIMIT);
  return summary;
}
