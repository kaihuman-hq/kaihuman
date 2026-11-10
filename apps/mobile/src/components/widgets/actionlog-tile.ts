import { type ActionLogEntry, parseActionLog } from '@kaihuman/formats';

/** Timestamps are local `YYYY-MM-DD HH:mm:ss`, so they compare correctly as strings. */
const pad = (n: number): string => String(n).padStart(2, '0');
const stamp = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const daysAgo = (now: Date, days: number): string =>
  stamp(new Date(now.getTime() - days * 86_400_000));

const newestFirst = (entries: readonly ActionLogEntry[]): ActionLogEntry[] =>
  // Files are append-only in the console but may be newest-first (the demo is), so order by time.
  [...entries]
    .reverse()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

export interface ActionLogQuery {
  text?: string;
  tag?: string;
  /** Rows to return; omit for the whole history. */
  limit?: number;
}

export interface ActionLogList {
  entries: ActionLogEntry[];
  /** Matches before `limit`, so the screen can offer "Show more". */
  matches: number;
  tags: string[];
}

export const actionLogList = (content: string, query: ActionLogQuery = {}): ActionLogList => {
  const all = parseActionLog(content).entries;
  const needle = (query.text ?? '').trim().toLowerCase();
  const matching = newestFirst(
    all.filter(
      (e) =>
        (!query.tag || e.tags.includes(query.tag)) &&
        (!needle || e.description.toLowerCase().includes(needle)),
    ),
  );
  return {
    entries: query.limit === undefined ? matching : matching.slice(0, query.limit),
    matches: matching.length,
    tags: [...new Set(all.flatMap((e) => e.tags))].sort(),
  };
};

export interface ActionLogStats {
  /** Last 7 days. */
  week: number;
  /** Last 30 days. */
  month: number;
  total: number;
}

export const actionLogStats = (content: string, now: Date): ActionLogStats => {
  const { entries } = parseActionLog(content);
  const week = daysAgo(now, 7);
  const month = daysAgo(now, 30);
  return {
    week: entries.filter((e) => e.timestamp >= week).length,
    month: entries.filter((e) => e.timestamp >= month).length,
    total: entries.length,
  };
};

export interface ActionLogReport {
  /** The last 12 months, newest first, empty months included. */
  months: { month: string; count: number }[];
  topTags: { tag: string; count: number }[];
}

export const actionLogReport = (content: string, now: Date, topTags = 5): ActionLogReport => {
  const { entries } = parseActionLog(content);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    return { month, count: entries.filter((e) => e.timestamp.startsWith(month)).length };
  });
  const counts = new Map<string, number>();
  for (const tag of entries.flatMap((e) => e.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return {
    months,
    topTags: [...counts]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, topTags),
  };
};

const TAG_TEXT = /\s*#[\w-]+/g;

/** The entry text without its inline `#tags` (shown as chips); a tags-only entry keeps them. */
export const stripTags = (description: string): string =>
  description.replace(TAG_TEXT, '').trim() || description;

/** `HH:mm` of a log timestamp. */
export const entryTime = (timestamp: string): string => timestamp.slice(11, 16);

export interface ActionLogDay {
  /** `YYYY-MM-DD`. */
  day: string;
  /** Today, Yesterday, or e.g. `Thu, Nov 5, 2026`. */
  title: string;
  entries: ActionLogEntry[];
}

const dayTitle = (day: string, now: Date): string => {
  const today = stamp(now).slice(0, 10);
  if (day === today) return 'Today';
  if (day === stamp(new Date(now.getTime() - 86_400_000)).slice(0, 10)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/** Groups newest-first entries into consecutive days, for sticky day headers. */
export const groupByDay = (entries: readonly ActionLogEntry[], now: Date): ActionLogDay[] => {
  const days: ActionLogDay[] = [];
  for (const e of entries) {
    const day = e.timestamp.slice(0, 10);
    const last = days[days.length - 1];
    if (last?.day === day) last.entries.push(e);
    else days.push({ day, title: dayTitle(day, now), entries: [e] });
  }
  return days;
};
