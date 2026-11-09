/**
 * Pure presenters and mutators behind the dashboard tiles, one per widget file type the console
 * supports. Each `*View` turns a file's text into plain view data; each mutator takes the file's
 * text and returns its new text (or a `TileResult` when the input can be rejected), so the screen
 * layer only has to persist the result. Parsing and serialising stay in `@kaihuman/formats`;
 * `now` is always injected so tiles render and test deterministically.
 */
import {
  type ActionLogEntry,
  addCommand,
  addPrompt,
  appendAction,
  type CommandEntry,
  calculateStats,
  checkIn,
  commandParameters,
  type DayEntry,
  deleteAll,
  deleteAllRead,
  fillCommand,
  getUpcomingEvents,
  localDate,
  markReadItLaterRead,
  parseActionLog,
  parseCommands,
  parseEvents,
  parseHabitData,
  parsePrompts,
  parseReadItLater,
  parseTimeTracking,
  parseTimezones,
  type ReadItLaterItem,
  serializeActionLog,
  serializeEvents,
  serializeHabitData,
  serializePrompts,
  serializeReadItLater,
  serializeTimeTracking,
  type TimeTrackingData,
} from '@kaihuman/formats';
import {
  addColumn,
  addConsumptionEntry,
  getYearlyStats,
  parseConsumption,
  sameDayLastYear,
  serializeConsumption,
} from '@kaihuman/formats/consumption';
import {
  addEntry as addStockEntry,
  aggregateByPeriod,
  getStats,
  type PeriodPoint,
  parseStocks,
  type StockPeriod,
} from '@kaihuman/formats/stocks';
import { feedStore } from '../../files/feed-store.js';
import {
  type BoardOverviewView,
  boardOverviewView,
  type PaletteSettingsView,
  paletteSettingsView,
  type RssView,
  rssView,
  type TravelView,
  travelView,
} from './more-tiles.js';
import { type TodosView, todosView } from './todos-tile.js';

export type { PeriodPoint, StockPeriod } from '@kaihuman/formats/stocks';
export * from './actionlog-tile.js';
export * from './bookmarks-tile.js';
export * from './more-tiles.js';
export * from './read-later-tile.js';
export * from './templates-tile.js';
export * from './timetracking-tile.js';
export * from './timezones-tile.js';
export * from './todos-tile.js';

/** Outcome of a mutation that can be rejected; `content` is the file's new text. */
export type TileResult = { ok: true; content: string } | { ok: false; error: string };

const ok = (content: string): TileResult => ({ ok: true, content });
const fail = (error: string): TileResult => ({ ok: false, error });
const pad = (n: number): string => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;

/** `2026-11-05` -> local midnight; avoids the UTC shift of `new Date('2026-11-05')`. */
const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

const hasTag = (tags: readonly string[], tag: string | undefined): boolean =>
  !tag || tags.includes(tag);

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort();

// ─── .habit.csv ──────────────────────────────────────────────────────────────

export interface HabitDay {
  date: string;
  reached: boolean;
  isToday: boolean;
  /** After today; drawn blank and not tappable. */
  future?: boolean;
}

export interface HabitView {
  currentStreak: number;
  weekStreak: number;
  totalCount: number;
  checkedInToday: boolean;
  checkedInYesterday: boolean;
  /** The last seven days, oldest first, ending today. */
  strip: HabitDay[];
  /** Activity heatmap like the web: 20 week columns (Sunday first), oldest first, ending this week. */
  weeks: HabitDay[][];
  /** Short month name over the first column of each month. */
  monthLabels: { week: number; label: string }[];
}

export const HABIT_WEEKS = 20;

export const habitView = (content: string, now: Date): HabitView => {
  const data = parseHabitData(content);
  const reached = new Set(data.entries.filter((e) => e.reached).map((e) => e.date));
  const today = localDate(now);
  const day = (back: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const strip: HabitDay[] = [];
  for (let back = 6; back >= 0; back--) {
    const date = localDate(day(back));
    strip.push({ date, reached: reached.has(date), isToday: date === today });
  }
  const weekStart = day(now.getDay());
  const weeks: HabitDay[][] = [];
  const monthLabels: { week: number; label: string }[] = [];
  for (let w = 0; w < HABIT_WEEKS; w++) {
    const col: HabitDay[] = [];
    for (let d = 0; d < 7; d++) {
      const at = new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() - (HABIT_WEEKS - 1 - w) * 7 + d,
      );
      const date = localDate(at);
      col.push({
        date,
        reached: reached.has(date),
        isToday: date === today,
        future: date > today,
      });
      if (d === 0 && monthLabels.at(-1)?.label !== MONTHS[at.getMonth()]) {
        monthLabels.push({ week: w, label: MONTHS[at.getMonth()] as string });
      }
    }
    weeks.push(col);
  }
  return {
    ...calculateStats(data, now),
    checkedInToday: reached.has(today),
    checkedInYesterday: reached.has(localDate(day(1))),
    strip,
    weeks,
    monthLabels,
  };
};

/** Checks a day in, or takes the check-in back when it was a mis-tap. Future days are refused. */
export const toggleHabitDay = (content: string, date: string, now: Date): TileResult => {
  if (!ISO_DAY.test(date) || date > localDate(now)) {
    return { ok: false, error: 'You can only check in today or earlier.' };
  }
  const data = parseHabitData(content);
  if (!data.entries.some((e) => e.date === date && e.reached)) return ok(checkIn(content, date));
  return ok(
    serializeHabitData({
      entries: data.entries.map((e) => (e.date === date ? { ...e, reached: false } : e)),
    }),
  );
};

/** Checks today in, or takes the check-in back when it was a mis-tap. */
export const toggleHabitToday = (content: string, now: Date): string => {
  const r = toggleHabitDay(content, localDate(now), now);
  return r.ok ? r.content : content;
};

// ─── .timetracking.csv ───────────────────────────────────────────────────────

export type TimerView =
  | { state: 'idle'; todayMinutes: number }
  | { state: 'running'; since: string; elapsedSeconds: number; todayMinutes: number };

const hmToMinutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const todayEntry = (data: TimeTrackingData, now: Date): DayEntry | undefined =>
  data.entries.find((e) => e.date === localDate(now));

/** Closed intervals plus the open one counted up to `now`. */
const trackedMinutes = (entry: DayEntry | undefined, now: Date): number => {
  if (!entry) return 0;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return entry.intervals.reduce(
    (sum, i) => sum + Math.max(0, (i.end ? hmToMinutes(i.end) : nowMin) - hmToMinutes(i.start)),
    0,
  );
};

export const timerView = (content: string, now: Date): TimerView => {
  const entry = todayEntry(parseTimeTracking(content), now);
  const todayMinutes = trackedMinutes(entry, now);
  const last = entry?.intervals[entry.intervals.length - 1];
  if (!last || last.end) return { state: 'idle', todayMinutes };
  const [h, m] = last.start.split(':').map(Number);
  const started = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h ?? 0, m ?? 0);
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
  return { state: 'running', since: last.start, elapsedSeconds, todayMinutes };
};

const stamp = (now: Date): string => `${pad(now.getHours())}:${pad(now.getMinutes())}`;

/** No-op while a timer already runs, so a double tap cannot open two intervals. */
export const clockIn = (content: string, now: Date): string => {
  if (timerView(content, now).state === 'running') return content;
  const data = parseTimeTracking(content);
  const entry = todayEntry(data, now);
  const interval = { start: stamp(now) };
  const entries = entry
    ? data.entries.map((e) => (e === entry ? { ...e, intervals: [...e.intervals, interval] } : e))
    : [{ date: localDate(now), intervals: [interval] }, ...data.entries];
  return serializeTimeTracking({ ...data, entries });
};

/** No-op when nothing runs. */
export const clockOut = (content: string, now: Date): string => {
  if (timerView(content, now).state !== 'running') return content;
  const data = parseTimeTracking(content);
  const entries = data.entries.map((e) => {
    if (e.date !== localDate(now)) return e;
    const intervals = e.intervals.map((i, idx) =>
      idx === e.intervals.length - 1 ? { ...i, end: stamp(now) } : i,
    );
    return { ...e, intervals };
  });
  return serializeTimeTracking({ ...data, entries });
};

/** `1:05:09` style label for an elapsed-seconds counter. */
export const formatElapsed = (seconds: number): string =>
  `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;

// ─── .events.csv ─────────────────────────────────────────────────────────────

export interface EventRow {
  name: string;
  kind: 'birthday' | 'event';
  date: string;
  daysUntil: number;
  label: string;
  /** Age being turned, for birthdays. */
  turns?: number;
}

export const eventsView = (content: string, now: Date, limit = 8): EventRow[] =>
  getUpcomingEvents(parseEvents(content), limit, now).map((u) => {
    const birthday = u.entry.type === 'birthday';
    return {
      name: u.entry.name,
      kind: birthday ? 'birthday' : 'event',
      date: localDate(u.date),
      daysUntil: u.daysUntil,
      label: u.durationLabel,
      turns: birthday
        ? u.date.getFullYear() - parseLocalDate(u.entry.startDate).getFullYear()
        : undefined,
    };
  });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calendar-block parts of a `YYYY-MM-DD` date, computed without a timezone or locale. */
export const eventDateParts = (iso: string): { day: string; month: string; weekday: string } => {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return {
    day: String(d),
    month: MONTHS[m - 1] ?? '',
    weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '',
  };
};

export interface EventGroup {
  /** "Today", "Tomorrow", else "Mon 9 Nov". */
  title: string;
  rows: EventRow[];
}

/** Consecutive rows on the same day under one heading; input order (soonest first) is kept. */
export const groupEventsByDay = (rows: readonly EventRow[]): EventGroup[] => {
  const groups: (EventGroup & { date: string })[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) {
      last.rows.push(row);
      continue;
    }
    const p = eventDateParts(row.date);
    const title =
      row.daysUntil === 0
        ? 'Today'
        : row.daysUntil === 1
          ? 'Tomorrow'
          : `${p.weekday} ${p.day} ${p.month}`;
    groups.push({ title, date: row.date, rows: [row] });
  }
  return groups.map(({ title, rows: r }) => ({ title, rows: r }));
};

export interface EventDraft {
  name: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate?: string;
  type?: 'general' | 'birthday';
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const addEvent = (content: string, draft: EventDraft): TileResult => {
  const name = draft.name.trim().replace(/;/g, ',');
  if (!name) return fail('Enter a name');
  if (!ISO_DAY.test(draft.startDate)) return fail('Enter a date as YYYY-MM-DD');
  const endDate = draft.endDate || draft.startDate;
  if (!ISO_DAY.test(endDate) || endDate < draft.startDate)
    return fail('The end date is before the start');
  const data = parseEvents(content);
  data.entries.push({ name, type: draft.type ?? 'general', startDate: draft.startDate, endDate });
  return ok(serializeEvents(data));
};

// ─── .actionlog.md ───────────────────────────────────────────────────────────

export interface ActionLogView {
  /** Newest first. */
  entries: ActionLogEntry[];
  tags: string[];
}

export const actionLogView = (content: string, limit = 5, tag?: string): ActionLogView => {
  const { entries } = parseActionLog(content);
  const filtered = entries.filter((e) => hasTag(e.tags, tag));
  return {
    // Files are append-only in the console but may be newest-first (the demo is), so order by time.
    entries: [...filtered]
      .reverse()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit),
    tags: uniqueSorted(entries.flatMap((e) => e.tags)),
  };
};

export const logAction = (
  content: string,
  description: string,
  now: Date,
  tags: string[] = [],
): TileResult => {
  const text = description.trim();
  if (!text) return fail('Enter what you did');
  return ok(serializeActionLog(appendAction(parseActionLog(content), text, tags, now)));
};

// ─── .timezones.json ─────────────────────────────────────────────────────────

export interface WorldClock {
  id: string;
  name: string;
  cities: string[];
  /** Local wall-clock time in the zone, `HH:mm`. */
  time: string;
  /** Weekday and date in the zone. */
  date: string;
  /** Live UTC offset, DST included, e.g. `+01:00`. */
  offset: string;
  offsetMinutes: number;
  /** Hours (fractional) the zone is ahead of the device's own zone. */
  hoursFromLocal: number;
}

/** UTC offset of an IANA zone at an instant, read back from Intl so DST is always right. */
export const zoneOffsetMinutes = (iana: string, at: Date): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: iana,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
};

export const formatOffset = (minutes: number): string => {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

/** Zones Intl does not know are skipped rather than rendered as `--:--`. */
export const worldClocksView = (content: string, now: Date): WorldClock[] => {
  const localMinutes = -now.getTimezoneOffset();
  const clocks: WorldClock[] = [];
  for (const tz of parseTimezones(content).timezones) {
    try {
      const offsetMinutes = zoneOffsetMinutes(tz.name, now);
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz.name,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now);
      const date = new Intl.DateTimeFormat('en-US', {
        timeZone: tz.name,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(now);
      clocks.push({
        id: tz.id,
        name: tz.name,
        cities: tz.cities ?? [],
        time,
        date,
        offset: formatOffset(offsetMinutes),
        offsetMinutes,
        hoursFromLocal: (offsetMinutes - localMinutes) / 60,
      });
    } catch {
      // Invalid IANA name in a hand-edited file.
    }
  }
  return clocks;
};

// ─── .readitlater.json ───────────────────────────────────────────────────────

export interface ReadLaterView {
  unread: ReadItLaterItem[];
  read: ReadItLaterItem[];
}

export const readLaterView = (content: string): ReadLaterView => {
  const items = [...parseReadItLater(content).items].sort((a, b) => b.createdAt - a.createdAt);
  return {
    unread: items.filter((i) => i.status === 'new'),
    read: items.filter((i) => i.status === 'read'),
  };
};

export const markReadLaterRead = (content: string, id: string, now: Date): TileResult => {
  try {
    return ok(markReadItLaterRead(content, id, now.getTime()));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
};

/** Empties the queue: only read items by default, everything with `includeUnread`. */
export const clearReadLater = (content: string, includeUnread = false): string => {
  const config = parseReadItLater(content);
  return serializeReadItLater(includeUnread ? deleteAll(config) : deleteAllRead(config));
};

export const isHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const addReadLaterUrl = (
  content: string,
  url: string,
  now: Date,
  name?: string,
): TileResult => {
  const trimmed = url.trim();
  if (!isHttpUrl(trimmed)) return fail('Enter an http(s) URL');
  const href = new URL(trimmed).href;
  const config = parseReadItLater(content);
  if (config.items.some((i) => i.url === href)) return fail('That page is already on the list');
  const item: ReadItLaterItem = {
    id: `ril-${now.getTime()}`,
    url: href,
    name: name?.trim() || new URL(href).hostname,
    status: 'new',
    tags: [],
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  };
  return ok(serializeReadItLater({ ...config, items: [item, ...config.items] }));
};

// ─── .bookmarks.json ─────────────────────────────────────────────────────────

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  useCount: number;
  lastUsedAt: string;
  pinned: boolean;
}

interface BookmarksFile {
  bookmarks: Bookmark[];
  updatedAt: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Same tolerance as the console: entries without a usable http(s) url are dropped. */
export const parseBookmarksFile = (content: string): BookmarksFile => {
  try {
    const parsed = JSON.parse(content) as { bookmarks?: unknown; updatedAt?: unknown };
    const raw = Array.isArray(parsed.bookmarks) ? (parsed.bookmarks as Partial<Bookmark>[]) : [];
    const bookmarks = raw
      .filter((b) => isHttpUrl(str(b?.url)))
      .map((b, i) => ({
        id: str(b.id) || `bookmark-${i}`,
        title: str(b.title) || str(b.url),
        url: str(b.url),
        tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === 'string') : [],
        createdAt: str(b.createdAt),
        updatedAt: str(b.updatedAt),
        useCount: typeof b.useCount === 'number' && b.useCount > 0 ? Math.floor(b.useCount) : 0,
        lastUsedAt: str(b.lastUsedAt),
        pinned: b.pinned === true,
      }));
    return { bookmarks, updatedAt: str(parsed.updatedAt) };
  } catch {
    return { bookmarks: [], updatedAt: '' };
  }
};

export const serializeBookmarksFile = (file: BookmarksFile): string =>
  `${JSON.stringify(file, null, 2)}\n`;

export type BookmarkSort = 'NEWEST' | 'MOST_USED' | 'LEAST_USED' | 'FRECENCY';

export interface BookmarkQuery {
  text?: string;
  tag?: string;
  sort?: BookmarkSort;
}

/** Use count halved for every 30 days since last use, so a stale favourite sinks. */
const frecency = (b: Bookmark, now: Date): number => {
  const last = Date.parse(b.lastUsedAt);
  if (Number.isNaN(last)) return 0;
  const ageDays = Math.max(0, (now.getTime() - last) / DAY_MS);
  return b.useCount * 0.5 ** (ageDays / 30);
};

export interface BookmarksView {
  bookmarks: Bookmark[];
  tags: string[];
}

export const bookmarksView = (content: string, query: BookmarkQuery, now: Date): BookmarksView => {
  const all = parseBookmarksFile(content).bookmarks;
  const needle = (query.text ?? '').trim().toLowerCase();
  const matched = all
    .map((bookmark, index) => ({ bookmark, index }))
    .filter(({ bookmark: b }) => {
      if (!hasTag(b.tags, query.tag)) return false;
      if (!needle) return true;
      return (
        b.title.toLowerCase().includes(needle) ||
        b.url.toLowerCase().includes(needle) ||
        b.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  const sort = query.sort ?? 'NEWEST';
  const key = (b: Bookmark): number =>
    sort === 'MOST_USED' ? -b.useCount : sort === 'LEAST_USED' ? b.useCount : -frecency(b, now);
  // Ties keep the file's order so the list does not jump between renders.
  if (sort !== 'NEWEST')
    matched.sort((a, b) => key(a.bookmark) - key(b.bookmark) || a.index - b.index);
  return {
    bookmarks: matched.map((m) => m.bookmark),
    tags: uniqueSorted(all.flatMap((b) => b.tags)),
  };
};

export const addBookmarkEntry = (
  content: string,
  draft: { title?: string; url: string; tags?: string[] },
  now: Date,
): TileResult => {
  const raw = draft.url.trim();
  if (!isHttpUrl(raw)) return fail('Enter an http(s) URL');
  const url = new URL(raw).href;
  const file = parseBookmarksFile(content);
  if (file.bookmarks.some((b) => b.url === url)) return fail('That page is already bookmarked');
  const iso = now.toISOString();
  const bookmark: Bookmark = {
    id: `bm-${now.getTime()}`,
    title: draft.title?.trim() || url,
    url,
    tags: (draft.tags ?? []).map((t) => t.trim()).filter(Boolean),
    createdAt: iso,
    updatedAt: iso,
    useCount: 0,
    lastUsedAt: '',
    pinned: false,
  };
  return ok(serializeBookmarksFile({ bookmarks: [bookmark, ...file.bookmarks], updatedAt: iso }));
};

export const deleteBookmarkEntry = (content: string, id: string, now: Date): string => {
  const file = parseBookmarksFile(content);
  return serializeBookmarksFile({
    bookmarks: file.bookmarks.filter((b) => b.id !== id),
    updatedAt: now.toISOString(),
  });
};

// ─── .budget.csv ─────────────────────────────────────────────────────────────

export interface BudgetTransaction {
  name: string;
  account: string;
  category: string;
  date: string;
  value: number;
}

/** Category ids the console's budget widget treats as money in; everything else is spending. */
const INCOME_CATEGORIES: ReadonlySet<string> = new Set(['earnings', 'other-income']);

/** A repeated name/account/category keeps only its latest-dated row, as in the console. */
export const parseBudgetCsv = (content: string): BudgetTransaction[] => {
  const latest = new Map<string, BudgetTransaction>();
  for (const line of content.split('\n')) {
    if (!line.trim() || line.trim().startsWith('name;')) continue;
    const p = line.split(';');
    if (p.length < 5) continue;
    const t: BudgetTransaction = {
      name: p[0] ?? '',
      account: p[1] ?? '',
      category: p[2] ?? '',
      date: p[3] ?? '',
      value: Number.parseFloat(p[4] ?? '0') || 0,
    };
    const key = `${t.name}|${t.account}|${t.category}`;
    const existing = latest.get(key);
    if (!existing || t.date > existing.date) latest.set(key, t);
  }
  return [...latest.values()];
};

export interface BudgetMonth {
  month: string;
  income: number;
  spending: number;
  net: number;
}

export interface BudgetView {
  income: number;
  spending: number;
  net: number;
  /** Spending per category, largest first. */
  categories: { id: string; value: number }[];
  /** Income minus spending per account, largest first. */
  accounts: { id: string; value: number }[];
  /** Chart series, oldest month first. */
  months: BudgetMonth[];
}

export const budgetView = (content: string): BudgetView => {
  const rows = parseBudgetCsv(content);
  const categories = new Map<string, number>();
  const accounts = new Map<string, number>();
  const months = new Map<string, BudgetMonth>();
  let income = 0;
  let spending = 0;
  for (const t of rows) {
    const isIncome = INCOME_CATEGORIES.has(t.category);
    const signed = isIncome ? t.value : -t.value;
    if (isIncome) income += t.value;
    else {
      spending += t.value;
      categories.set(t.category, (categories.get(t.category) ?? 0) + t.value);
    }
    accounts.set(t.account, (accounts.get(t.account) ?? 0) + signed);
    const month = t.date.slice(0, 7);
    const m = months.get(month) ?? { month, income: 0, spending: 0, net: 0 };
    if (isIncome) m.income += t.value;
    else m.spending += t.value;
    m.net = m.income - m.spending;
    months.set(month, m);
  }
  const ranked = (map: Map<string, number>) =>
    [...map].map(([id, value]) => ({ id, value })).sort((a, b) => b.value - a.value);
  return {
    income,
    spending,
    net: income - spending,
    categories: ranked(categories),
    accounts: ranked(accounts),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
};

// ─── .stocks.csv ─────────────────────────────────────────────────────────────

export interface StockPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  value: number;
  /** Total invested up to and including this point. */
  invested: number;
}

export interface StocksView {
  latestValue: number;
  invested: number;
  profit: number;
  profitPct: number;
  changeVsPrev: number | null;
  changeVsPrevPct: number | null;
  /** Compound annual growth, once the file spans a year. */
  cagr: number | null;
  allTimeHigh: number;
  /** Negative percentage below the all-time high. */
  drawdownPct: number;
  series: StockPoint[];
  /** Latest value per period, oldest first, as the web's overview table shows it. */
  periods: Record<StockPeriod, PeriodPoint[]>;
}

/**
 * Parsing is shared with the web, which writes `DD.MM.YYYY HH:MM:SS` stamps; an ISO-only
 * parser here dropped every row of a web-written file and the tile showed no data.
 */
export const stocksView = (content: string): StocksView | null => {
  const entries = parseStocks(content);
  const stats = getStats(entries);
  if (!stats) return null;
  let invested = 0;
  const series = entries.map((e) => {
    invested += e.invest;
    return { date: localDate(e.timestamp), value: e.value, invested };
  });
  return {
    latestValue: stats.latestValue,
    invested: stats.latestInvest,
    profit: stats.latestProfit,
    profitPct: stats.latestProfitPct,
    changeVsPrev: stats.changeVsPrev,
    changeVsPrevPct: stats.changeVsPrevPct,
    cagr: stats.cagr,
    allTimeHigh: stats.allTimeHigh,
    drawdownPct: stats.drawdownPct,
    series,
    periods: {
      weekly: aggregateByPeriod(entries, 'weekly'),
      monthly: aggregateByPeriod(entries, 'monthly'),
      yearly: aggregateByPeriod(entries, 'yearly'),
    },
  };
};

const parseAmount = (raw: string): number => Number.parseFloat(raw.trim().replace(',', '.'));

/** Adds a value reading, with the amount newly invested since the last one (blank means none). */
export const addStockValue = (
  content: string,
  value: string,
  invest: string,
  date: string,
  now: Date,
): TileResult => {
  const v = parseAmount(value);
  if (Number.isNaN(v)) return { ok: false, error: 'Enter the current value as a number.' };
  const i = invest.trim() ? parseAmount(invest) : 0;
  if (Number.isNaN(i)) return { ok: false, error: 'Enter the invested amount as a number.' };
  const day = date.trim() || localDate(now);
  if (!ISO_DAY.test(day)) return { ok: false, error: 'Use a date like 2026-01-31.' };
  const at = parseLocalDate(day);
  at.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  return ok(addStockEntry(content, v, i, at));
};

// ─── .consumption.csv ────────────────────────────────────────────────────────

export interface ConsumptionMeter {
  key: string;
  title: string;
  unit: string;
  yearlyTarget?: number;
  /** Latest recorded meter reading. */
  latestReading: number;
  /** Day of that reading, `YYYY-MM-DD`. */
  latestDate: string;
  /** Use between the last two recorded readings. */
  lastPeriodUse: number | null;
  /** Use so far this calendar year, as the web's small widget shows it. */
  yearUse: number;
  /** Share of the yearly target used, 0..1+, when a target is set. */
  targetProgress: number | null;
}

export interface ConsumptionRow {
  date: string;
  /** Use since the previous day per meter key; null when unknown. */
  use: Record<string, number | null>;
  /** Same day last year, when the file goes back that far. */
  lastYear: Record<string, number | null>;
}

export interface ConsumptionYear {
  year: number;
  total: Record<string, number>;
  perDay: Record<string, number>;
}

export interface ConsumptionView {
  meters: ConsumptionMeter[];
  /** Recorded (not gap-filled) days, newest first. */
  recent: ConsumptionRow[];
  /** Totals per calendar year, newest first. */
  years: ConsumptionYear[];
}

const finite = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n);

/**
 * Parsing is shared with the web (`DD.MM.YYYY` dates, the old two-date-column layout, daily
 * gap filling), so a reading added here lands in the file exactly as the web would write it.
 */
export const consumptionView = (content: string, now: Date): ConsumptionView => {
  const { data } = parseConsumption(content);
  const recorded = data.entries.filter((e) => !e.interpolated);
  const byDate = new Map(data.entries.map((e) => [e.date, e]));
  const years = getYearlyStats(data);
  const thisYear = years.find((y) => y.year === now.getFullYear());
  const meters: ConsumptionMeter[] = [];
  for (const col of data.columns) {
    const readings = recorded.filter((e) => finite(e.readings[col.key]));
    const last = readings[readings.length - 1];
    if (!last) continue;
    const prev = readings[readings.length - 2];
    const latestReading = last.readings[col.key] as number;
    const yearUse = thisYear?.totalByKey[col.key] ?? 0;
    meters.push({
      key: col.key,
      title: col.title,
      unit: col.unit,
      yearlyTarget: col.yearlyTarget > 0 ? col.yearlyTarget : undefined,
      latestReading,
      latestDate: last.date,
      lastPeriodUse: prev ? latestReading - (prev.readings[col.key] as number) : null,
      yearUse,
      targetProgress: col.yearlyTarget > 0 ? yearUse / col.yearlyTarget : null,
    });
  }
  const useOf = (e: { deltas: Record<string, number> } | undefined, key: string) => {
    const d = e?.deltas[key];
    return finite(d) && d > 0 ? d : null;
  };
  const recent = recorded
    .slice(-30)
    .reverse()
    .map((e) => {
      const ly = byDate.get(sameDayLastYear(e.date));
      return {
        date: e.date,
        use: Object.fromEntries(data.columns.map((c) => [c.key, useOf(e, c.key)])),
        lastYear: Object.fromEntries(data.columns.map((c) => [c.key, useOf(ly, c.key)])),
      };
    });
  return {
    meters,
    recent,
    years: [...years]
      .reverse()
      .map((y) => ({ year: y.year, total: y.totalByKey, perDay: y.avgPerDayByKey })),
  };
};

/** The meters a reading can be entered for, with the last reading as a hint. */
export const consumptionColumns = (
  content: string,
): { key: string; title: string; unit: string; last: number | null }[] => {
  const { data } = parseConsumption(content);
  return data.columns.map((c) => {
    const last = data.entries.filter((e) => finite(e.readings[c.key])).at(-1);
    return { ...c, last: last ? (last.readings[c.key] as number) : null };
  });
};

/** Records meter readings for a day; blank meters stay empty, like the web's add form. */
export const addConsumptionReading = (
  content: string,
  date: string,
  readings: Record<string, string>,
  now: Date,
): TileResult => {
  const { data } = parseConsumption(content);
  if (data.columns.length === 0) return { ok: false, error: 'Add a meter first.' };
  const day = date.trim() || localDate(now);
  if (!ISO_DAY.test(day)) return { ok: false, error: 'Use a date like 2026-01-31.' };
  if (data.entries.some((e) => e.date === day && !e.interpolated)) {
    return { ok: false, error: `There is already a reading for ${day}.` };
  }
  const parsed: Record<string, number> = {};
  for (const col of data.columns) {
    const raw = (readings[col.key] ?? '').trim();
    const n = raw ? Number(raw.replace(',', '.')) : Number.NaN;
    if (raw && Number.isNaN(n)) return { ok: false, error: `${col.title} must be a number.` };
    parsed[col.key] = n;
  }
  if (!Object.values(parsed).some(Number.isFinite)) {
    return { ok: false, error: 'Enter at least one reading.' };
  }
  // A gap-filled day is replaced by the real reading.
  const base = { ...data, entries: data.entries.filter((e) => e.date !== day) };
  return ok(serializeConsumption(addConsumptionEntry(base, day, parsed)));
};

/** Adds a meter column, e.g. Gas in m³ with a yearly target. */
export const addConsumptionMeter = (
  content: string,
  meter: { name: string; unit: string; yearlyTarget: string },
): TileResult => {
  const name = meter.name.trim();
  if (!name) return { ok: false, error: 'Give the meter a name.' };
  if (/[,[\];:]/.test(name)) return { ok: false, error: 'Names cannot contain , ; : [ or ].' };
  const { data } = parseConsumption(content);
  const key = name.replace(/\s+/g, '');
  if (data.columns.some((c) => c.key === key)) {
    return { ok: false, error: `${name} is already a meter.` };
  }
  const target = meter.yearlyTarget.trim() ? Number(meter.yearlyTarget.replace(',', '.')) : 0;
  if (Number.isNaN(target) || target < 0) {
    return { ok: false, error: 'The yearly target must be a number.' };
  }
  const unit = meter.unit.trim();
  if (/[,[\];:]/.test(unit)) return { ok: false, error: 'Units cannot contain , ; : [ or ].' };
  return ok(
    serializeConsumption(addColumn(data, { key, title: name, unit, yearlyTarget: target })),
  );
};

// ─── .data-collection.csv ────────────────────────────────────────────────────

export interface CollectionColumn {
  name: string;
  type: string;
  unit?: string;
}

export interface CollectionSeries {
  column: string;
  unit: string;
  latest: number;
  min: number;
  max: number;
  average: number;
  points: { x: string; y: number }[];
}

export interface DataCollectionView {
  columns: CollectionColumn[];
  rowCount: number;
  /** One chartable series per number column, labelled by the first date-like column. */
  series: CollectionSeries[];
}

/** Header cells are `name::X,type::Y,unit::Z` joined by `;`. */
export const dataCollectionView = (content: string): DataCollectionView => {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0];
  if (!header) return { columns: [], rowCount: 0, series: [] };
  const columns: CollectionColumn[] = [];
  for (const cell of header.split(';')) {
    const kv = new Map(
      cell
        .split(',')
        .map((p) => [p.slice(0, p.indexOf('::')), p.slice(p.indexOf('::') + 2)] as const),
    );
    const name = kv.get('name');
    if (name) columns.push({ name, type: kv.get('type') ?? 'text', unit: kv.get('unit') });
  }
  const dataLines = lines.slice(1);
  // Rows use ';' like the header, but spreadsheet exports use ','.
  const sep =
    (dataLines[0]?.split(',').length ?? 0) === columns.length && columns.length > 1 ? ',' : ';';
  const rows = dataLines.map((l) => l.trim().split(sep));
  const labelAt = columns.findIndex((c) => c.type.includes('date'));
  const series: CollectionSeries[] = [];
  columns.forEach((col, ci) => {
    if (col.type !== 'number') return;
    const points = rows
      .map((r, ri) => ({ x: labelAt >= 0 ? (r[labelAt] ?? '') : String(ri + 1), y: Number(r[ci]) }))
      .filter((p) => rows.length > 0 && !Number.isNaN(p.y));
    if (points.length === 0) return;
    const ys = points.map((p) => p.y);
    series.push({
      column: col.name,
      unit: col.unit ?? '',
      latest: ys[ys.length - 1] as number,
      min: Math.min(...ys),
      max: Math.max(...ys),
      average: ys.reduce((a, b) => a + b, 0) / ys.length,
      points,
    });
  });
  return { columns, rowCount: rows.length, series };
};

// ─── .prompts.md & .commands.md ──────────────────────────────────────────────

export interface TemplateRow {
  title: string;
  tags: string[];
  /** Template text with `{{param}}` placeholders intact. */
  template: string;
  /** Placeholder names in order of first appearance. */
  parameters: string[];
  note: string;
}

export interface TemplateQuery {
  text?: string;
  tag?: string;
}

const matchesTemplate = (row: TemplateRow, q: TemplateQuery): boolean => {
  if (!hasTag(row.tags, q.tag)) return false;
  const needle = (q.text ?? '').trim().toLowerCase();
  return (
    !needle || `${row.title}\n${row.template}\n${row.tags.join(' ')}`.toLowerCase().includes(needle)
  );
};

const promptRows = (content: string): TemplateRow[] =>
  parsePrompts(content).map((p) => ({
    title: p.title,
    tags: p.tags,
    template: p.body,
    parameters: commandParameters(p.body),
    note: '',
  }));

const commandRows = (content: string): TemplateRow[] =>
  parseCommands(content).map((c: CommandEntry) => ({
    title: c.title,
    tags: c.tags,
    template: c.command,
    parameters: commandParameters(c.command),
    note: c.note,
  }));

export interface TemplatesView {
  rows: TemplateRow[];
  tags: string[];
}

const templatesView = (all: TemplateRow[], query: TemplateQuery): TemplatesView => ({
  rows: all.filter((r) => matchesTemplate(r, query)),
  tags: uniqueSorted(all.flatMap((r) => r.tags)),
});

export const promptsView = (content: string, query: TemplateQuery = {}): TemplatesView =>
  templatesView(promptRows(content), query);

export const commandsView = (content: string, query: TemplateQuery = {}): TemplatesView =>
  templatesView(commandRows(content), query);

/** Text to put on the clipboard; a placeholder without a value stays as written. */
export const interpolateTemplate = (
  template: string,
  values: Readonly<Record<string, string>>,
): string => fillCommand(template, values);

/** Placeholders that still need a value before the template is worth copying. */
export const missingParameters = (
  row: TemplateRow,
  values: Readonly<Record<string, string>>,
): string[] => row.parameters.filter((p) => !(values[p] ?? '').trim());

export const addPromptEntry = (
  content: string,
  title: string,
  body: string,
  tags: string[] = [],
): TileResult => {
  if (!title.trim()) return fail('Enter a title');
  if (!body.trim()) return fail('Enter the prompt text');
  const prompts = addPrompt(parsePrompts(content), title, tags, body);
  return ok(serializePrompts(prompts));
};

export const addCommandEntry = (
  content: string,
  title: string,
  command: string,
  tags: string[] = [],
  note = '',
): TileResult => {
  if (!title.trim()) return fail('Enter a title');
  if (!command.trim()) return fail('Enter the command');
  return ok(addCommand(content, title, tags, command, note));
};

// ─── Dispatch ────────────────────────────────────────────────────────────────

export type TileView =
  | { kind: 'todos'; view: TodosView }
  | { kind: 'habit'; view: HabitView }
  | { kind: 'timetracking'; view: TimerView }
  | { kind: 'events'; view: EventRow[] }
  | { kind: 'actionlog'; view: ActionLogView }
  | { kind: 'timezones'; view: WorldClock[] }
  | { kind: 'readitlater'; view: ReadLaterView }
  | { kind: 'bookmarks'; view: BookmarksView }
  | { kind: 'budget'; view: BudgetView }
  | { kind: 'stocks'; view: StocksView | null }
  | { kind: 'consumption'; view: ConsumptionView }
  | { kind: 'datacollection'; view: DataCollectionView }
  | { kind: 'prompts'; view: TemplatesView }
  | { kind: 'commands'; view: TemplatesView }
  | { kind: 'rss'; view: RssView }
  | { kind: 'travel'; view: TravelView }
  | { kind: 'boardoverview'; view: BoardOverviewView }
  | { kind: 'palettesettings'; view: PaletteSettingsView };

export type TileKind = TileView['kind'];

const TILE_SUFFIXES: readonly (readonly [string, TileKind])[] = [
  ['.todos.md', 'todos'],
  ['.habit.csv', 'habit'],
  ['.timetracking.csv', 'timetracking'],
  ['.events.csv', 'events'],
  ['.actionlog.md', 'actionlog'],
  ['.timezones.json', 'timezones'],
  ['.readitlater.json', 'readitlater'],
  ['.bookmarks.json', 'bookmarks'],
  ['.budget.csv', 'budget'],
  ['.stocks.csv', 'stocks'],
  ['.consumption.csv', 'consumption'],
  ['.data-collection.csv', 'datacollection'],
  ['.prompts.md', 'prompts'],
  ['.commands.md', 'commands'],
  ['.rss.json', 'rss'],
  ['.travel.json', 'travel'],
  ['.board-overview.json', 'boardoverview'],
  ['command-palette.settings.json', 'palettesettings'],
];

export const TILE_EXTENSIONS: readonly string[] = TILE_SUFFIXES.map(([suffix]) => suffix);

/** The tile a file renders as, or undefined for files without a dashboard widget. */
export const tileKindForPath = (path: string): TileKind | undefined =>
  TILE_SUFFIXES.find(([suffix]) => path.endsWith(suffix))?.[1];

/** Default presentation of a file as its tile, for dashboards that just list the files. */
export const presentTile = (path: string, content: string, now: Date): TileView | undefined => {
  switch (tileKindForPath(path)) {
    case 'todos':
      return { kind: 'todos', view: todosView(content, now) };
    case 'habit':
      return { kind: 'habit', view: habitView(content, now) };
    case 'timetracking':
      return { kind: 'timetracking', view: timerView(content, now) };
    case 'events':
      return { kind: 'events', view: eventsView(content, now, 30) };
    case 'actionlog':
      return { kind: 'actionlog', view: actionLogView(content) };
    case 'timezones':
      return { kind: 'timezones', view: worldClocksView(content, now) };
    case 'readitlater':
      return { kind: 'readitlater', view: readLaterView(content) };
    case 'bookmarks':
      return { kind: 'bookmarks', view: bookmarksView(content, {}, now) };
    case 'budget':
      return { kind: 'budget', view: budgetView(content) };
    case 'stocks':
      return { kind: 'stocks', view: stocksView(content) };
    case 'consumption':
      return { kind: 'consumption', view: consumptionView(content, now) };
    case 'datacollection':
      return { kind: 'datacollection', view: dataCollectionView(content) };
    case 'prompts':
      return { kind: 'prompts', view: promptsView(content) };
    case 'commands':
      return { kind: 'commands', view: commandsView(content) };
    case 'rss':
      return { kind: 'rss', view: rssView(content, feedStore.snapshot(), now) };
    case 'travel':
      return { kind: 'travel', view: travelView(content, now) };
    case 'boardoverview':
      return { kind: 'boardoverview', view: boardOverviewView(content, [], now) };
    case 'palettesettings':
      return { kind: 'palettesettings', view: paletteSettingsView(content) };
    default:
      return undefined;
  }
};

export * from './budget-tile.js';
export * from './collection-tile.js';
