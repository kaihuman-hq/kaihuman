/**
 * History and break helpers for `.timetracking.csv`: the this-week total, a per-day list, a
 * per-week series and the 15/30/60 min break buttons. `now` is always injected.
 */
import {
  type DayEntry,
  getChartData,
  localDate,
  parseTimeTracking,
  serializeTimeTracking,
} from '@kaihuman/formats';

import type { TileResult } from './tile-controllers.js';

const pad = (n: number): string => String(n).padStart(2, '0');
const hm = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** An open interval only counts on today; on older days it is a forgotten clock-out. */
const entryMinutes = (entry: DayEntry, now: Date): number => {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = entry.date === localDate(now);
  return entry.intervals.reduce((sum, i) => {
    if (!i.end && !isToday) return sum;
    return sum + Math.max(0, (i.end ? toMin(i.end) : nowMin) - toMin(i.start));
  }, 0);
};

const parseDate = (date: string): Date => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** Monday of the week containing `date`, as `YYYY-MM-DD`. */
const weekStart = (date: Date): string => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
};

export interface HistoryDay {
  date: string;
  minutes: number;
  isToday: boolean;
}

export interface HistoryWeek {
  /** Monday of the week. */
  start: string;
  minutes: number;
  isCurrent: boolean;
}

export interface TimeHistoryView {
  weekMinutes: number;
  /** Last 14 days, newest first, only days with tracked time. */
  days: HistoryDay[];
  /** Last 8 weeks including the current one, oldest first, gaps filled with 0. */
  weeks: HistoryWeek[];
}

export const DAYS_SHOWN = 14;
export const WEEKS_SHOWN = 8;

export const timeHistoryView = (content: string, now: Date): TimeHistoryView => {
  const entries = parseTimeTracking(content).entries;
  const today = localDate(now);
  const thisWeek = weekStart(now);

  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS_SHOWN - 1));
  const cutoffDate = localDate(cutoff);
  const days = entries
    .filter((e) => e.date >= cutoffDate && e.date <= today)
    .map((e) => ({ date: e.date, minutes: entryMinutes(e, now), isToday: e.date === today }))
    .filter((d) => d.minutes > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const perWeek = new Map<string, number>();
  for (const e of entries) {
    const key = weekStart(parseDate(e.date));
    perWeek.set(key, (perWeek.get(key) ?? 0) + entryMinutes(e, now));
  }
  const weeks: HistoryWeek[] = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
    const monday = parseDate(thisWeek);
    monday.setDate(monday.getDate() - i * 7);
    const start = localDate(monday);
    weeks.push({ start, minutes: perWeek.get(start) ?? 0, isCurrent: start === thisWeek });
  }

  return { weekMinutes: perWeek.get(thisWeek) ?? 0, days, weeks };
};

export const BREAK_MINUTES = [15, 30, 60] as const;

/**
 * Carves a break out of today's most recent closed interval longer than the break, splitting the
 * remaining work time evenly around it (the same result as the web's pause buttons, but with an
 * injected clock).
 */
export const addBreak = (content: string, minutes: number, now: Date): TileResult => {
  const data = parseTimeTracking(content);
  const entry = data.entries.find((e) => e.date === localDate(now));
  if (!entry) return { ok: false, error: 'Clock in first to add a break.' };

  for (let i = entry.intervals.length - 1; i >= 0; i--) {
    const interval = entry.intervals[i];
    if (!interval?.end) continue;
    const start = toMin(interval.start);
    const duration = toMin(interval.end) - start;
    if (duration <= minutes) continue;

    const firstEnd = start + Math.floor((duration - minutes) / 2);
    const intervals = [
      ...entry.intervals.slice(0, i),
      { start: interval.start, end: hm(firstEnd) },
      { start: hm(firstEnd + minutes), end: interval.end },
      ...entry.intervals.slice(i + 1),
    ];
    return {
      ok: true,
      content: serializeTimeTracking({
        ...data,
        entries: data.entries.map((e) => (e === entry ? { ...e, intervals } : e)),
      }),
    };
  }
  return { ok: false, error: `No finished interval today is longer than ${minutes} min.` };
};

export type ChartMode = 'daily' | 'weekly' | 'monthly';

export const CHART_MODES: readonly { value: ChartMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export interface ChartPoint {
  label: string;
  /** Work hours in the bucket. */
  work: number;
  /** Break hours; only the daily series has them. */
  breaks: number;
}

export interface ChartView {
  mode: ChartMode;
  points: ChartPoint[];
  /** Top of the value axis, never below 1 so an empty chart still has a scale. */
  maxHours: number;
  totalHours: number;
}

/** Same series the web charts show, from the shared aggregation in `@kaihuman/formats`. */
export const chartView = (content: string, mode: ChartMode): ChartView => {
  const data = getChartData(parseTimeTracking(content));
  const points: ChartPoint[] =
    mode === 'daily'
      ? data.daily.map((d) => ({ label: d.date, work: d.workHours, breaks: d.breakHours }))
      : mode === 'weekly'
        ? data.weekly.map((d) => ({ label: d.week, work: d.hours, breaks: 0 }))
        : data.monthly.map((d) => ({ label: d.month, work: d.hours, breaks: 0 }));
  const maxHours = Math.max(1, ...points.map((p) => Math.max(p.work, p.breaks)));
  const totalHours = Math.round(points.reduce((s, p) => s + p.work, 0) * 100) / 100;
  return { mode, points, maxHours, totalHours };
};

/** SVG path through the values, scaled into a `width` x `height` box (y grows downward). */
export const linePath = (
  values: readonly number[],
  maxHours: number,
  width: number,
  height: number,
): string => {
  const x = (i: number) => (values.length <= 1 ? width / 2 : (i / (values.length - 1)) * width);
  const y = (v: number) => height - (v / maxHours) * height;
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
};

/** Evenly thinned label indices so a long axis shows about `max` labels. */
export const labelIndices = (count: number, max = 4): number[] => {
  const all = Array.from({ length: count }, (_, i) => i);
  if (count <= max) return all;
  const step = Math.ceil(count / max);
  return all.filter((i) => i % step === 0);
};

export const formatHours = (h: number): string => `${Math.round(h * 10) / 10}h`;

/** Milliseconds until the next whole `unitMs` boundary after `nowMs`; a full unit when exactly on one. */
export const msToNextBoundary = (nowMs: number, unitMs: number): number =>
  unitMs - (nowMs % unitMs);

/** Index of the point nearest to horizontal position `x` on a line drawn across `width`. */
export const pointIndexAt = (x: number, width: number, count: number): number => {
  if (count <= 1 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((x / width) * (count - 1))));
};

/** Callout text for a tapped point: the bucket label, work hours and (daily only) break hours. */
export const pointDetail = (
  point: ChartPoint,
  mode: ChartMode,
): { title: string; lines: string[] } => ({
  title: point.label,
  lines:
    mode === 'daily'
      ? [`Work: ${formatHours(point.work)}`, `Breaks: ${formatHours(point.breaks)}`]
      : [`Work: ${formatHours(point.work)}`],
});
