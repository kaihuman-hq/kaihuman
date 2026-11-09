/**
 * Data-collection tile beyond the glance numbers: a time filter, recent rows, bar series and the
 * add-entry mutator. The file layout (`name::X,type::Y,unit::Z` header, `;` rows) matches the console.
 */
import { localDate } from '@kaihuman/formats';
import type { TileResult } from './tile-controllers.js';

export type CollectionFilter = 'ALL' | '6M' | '12M' | 'YTD';

export interface CollectionCol {
  name: string;
  type: string;
  unit: string;
}

interface Parsed {
  columns: CollectionCol[];
  rows: string[][];
  sep: ';' | ',';
}

const isDateType = (t: string) => ['date', 'auto:date', 'auto:date:yesterday'].includes(t);
const isAuto = (t: string) => t.startsWith('auto:');

const parse = (content: string): Parsed => {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const columns: CollectionCol[] = [];
  for (const cell of (lines[0] ?? '').split(';')) {
    const kv = new Map(
      cell
        .split(',')
        .map((p) => [p.slice(0, p.indexOf('::')), p.slice(p.indexOf('::') + 2)] as const),
    );
    const name = kv.get('name');
    if (name) columns.push({ name, type: kv.get('type') ?? 'text', unit: kv.get('unit') ?? '' });
  }
  const data = lines.slice(1);
  // Spreadsheet exports separate rows with ',' while the header keeps ';'.
  const sep =
    columns.length > 1 && (data[0]?.split(',').length ?? 0) === columns.length ? ',' : ';';
  return { columns, rows: data.map((l) => l.trim().split(sep)), sep };
};

/** `YYYY-MM-DD` reads as local midnight so a date does not shift with the time zone. */
const toDate = (raw: string | undefined): Date | null => {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const inRange = (d: Date, filter: CollectionFilter, now: Date): boolean => {
  if (filter === 'YTD') return d.getFullYear() === now.getFullYear();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - (filter === '6M' ? 6 : 12));
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
};

export interface CollectionBar {
  label: string;
  value: number;
  /** 0..1 of the series range, so a bar is always drawable. */
  fraction: number;
}

export interface CollectionDetailSeries {
  column: string;
  unit: string;
  latest: number;
  min: number;
  max: number;
  average: number;
  bars: CollectionBar[];
}

export interface CollectionDetail {
  columns: CollectionCol[];
  /** Columns the user fills in; auto columns are computed on save. */
  inputColumns: CollectionCol[];
  /** Rows inside the filter. */
  rowCount: number;
  series: CollectionDetailSeries[];
  /** Newest last-written first, as cells aligned with `columns`. */
  recent: string[][];
}

const BAR_COUNT = 12;

/** The filter looks at the first date-like column; files without one ignore it, as in the console. */
export const collectionDetail = (
  content: string,
  now: Date,
  filter: CollectionFilter,
  recentLimit = 6,
): CollectionDetail => {
  const { columns, rows: all } = parse(content);
  const dateAt = columns.findIndex((c) => isDateType(c.type));
  const rows =
    filter === 'ALL' || dateAt < 0
      ? all
      : all.filter((r) => {
          const d = toDate(r[dateAt]);
          return d !== null && inRange(d, filter, now);
        });
  const labelAt = columns.findIndex((c) => c.type.includes('date'));
  const series: CollectionDetailSeries[] = [];
  columns.forEach((col, ci) => {
    if (col.type !== 'number') return;
    const points = rows
      .map((r, ri) => ({
        x: labelAt >= 0 ? (r[labelAt] ?? '') : String(ri + 1),
        y: (r[ci] ?? '').trim() === '' ? Number.NaN : Number(r[ci]),
      }))
      .filter((p) => !Number.isNaN(p.y));
    if (points.length === 0) return;
    const ys = points.map((p) => p.y);
    const lo = Math.min(0, ...ys);
    const hi = Math.max(0, ...ys);
    series.push({
      column: col.name,
      unit: col.unit,
      latest: ys[ys.length - 1] as number,
      min: Math.min(...ys),
      max: Math.max(...ys),
      average: ys.reduce((a, b) => a + b, 0) / ys.length,
      bars: points.slice(-BAR_COUNT).map((p) => ({
        label: p.x.slice(0, 10),
        value: p.y,
        fraction: hi === lo ? 1 : (p.y - lo) / (hi - lo),
      })),
    });
  });
  return {
    columns,
    inputColumns: columns.filter((c) => !isAuto(c.type)),
    rowCount: rows.length,
    series,
    recent: rows.slice(-recentLimit).reverse(),
  };
};

/** Raw field text per column name. */
export type CollectionDraft = Record<string, string>;

export const addCollectionEntry = (
  content: string,
  draft: CollectionDraft,
  now: Date,
): TileResult => {
  const { columns, sep } = parse(content);
  if (columns.length === 0) return { ok: false, error: 'This file has no columns yet.' };
  const cells = new Map<string, string>();
  for (const col of columns) {
    if (isAuto(col.type)) continue;
    const raw = (draft[col.name] ?? '').trim();
    if (raw === '') return { ok: false, error: `${col.name} is required.` };
    if (col.type === 'number') {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n)) return { ok: false, error: `${col.name} must be a number.` };
      cells.set(col.name, String(n));
    } else if (col.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
        return { ok: false, error: `${col.name} must be a date like ${localDate(now)}.` };
      }
      cells.set(col.name, raw);
    } else {
      if (/[;\r\n]/.test(raw) || raw.includes(sep)) {
        return { ok: false, error: `${col.name} cannot contain "${sep}" or line breaks.` };
      }
      cells.set(col.name, raw);
    }
  }
  const numbers = columns
    .filter((c) => c.type === 'number')
    .map((c) => Number(cells.get(c.name) ?? 0));
  const total = numbers.reduce((a, b) => a + b, 0);
  for (const col of columns) {
    if (col.type === 'auto:date') cells.set(col.name, now.toISOString());
    else if (col.type === 'auto:date:yesterday') {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      cells.set(col.name, d.toISOString());
    } else if (col.type === 'auto:number:sum') cells.set(col.name, String(total));
    else if (col.type === 'auto:number:avg')
      cells.set(col.name, String(numbers.length > 0 ? total / numbers.length : 0));
    else if (isAuto(col.type)) cells.set(col.name, '');
  }
  const row = columns.map((c) => cells.get(c.name) ?? '').join(sep);
  return { ok: true, content: `${content.replace(/\s+$/, '')}\n${row}` };
};
