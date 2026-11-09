/**
 * Consumption tile: the per-meter overview, recent readings and yearly totals, the web's monthly
 * and year-compare views, and the mutators (add reading, add meter, remove meter). Parsing and
 * aggregation stay in `@kaihuman/formats/consumption`, shared with the web widget.
 */
import { localDate } from '@kaihuman/formats';
import {
  addColumn,
  addConsumptionEntry,
  type CompareMode,
  type ConsumptionData,
  compareYearData,
  getMonthlyStats,
  getYearlyStats,
  MONTH_NAMES,
  type MonthlyStats,
  monthPctChange,
  parseConsumption,
  sameDayLastYear,
  serializeConsumption,
} from '@kaihuman/formats/consumption';
import type { TileResult } from './tile-controllers.js';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ok = (content: string): TileResult => ({ ok: true, content });

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

// ─── Monthly / compare ───────────────────────────────────────────────────────

export interface ConsumptionModel {
  data: ConsumptionData;
  monthly: MonthlyStats[];
  /** Years with readings, oldest first. */
  years: number[];
}

/** The web widget's parsed model (gap-filled daily deltas) behind the Monthly and Compare tabs. */
export const consumptionModel = (content: string): ConsumptionModel => {
  const { data } = parseConsumption(content);
  return {
    data,
    monthly: getMonthlyStats(data),
    years: getYearlyStats(data).map((y) => y.year),
  };
};

export interface MonthRow {
  month: number;
  name: string;
  total: number | null;
  avgPerDay: number | null;
  /** Percent change of the daily average against the same month a year earlier. */
  change: number | null;
  /** Whether `change` is an improvement for this meter (less is better unless `higherIsBetter`). */
  good: boolean | null;
  days: number | null;
}

export const monthRows = (model: ConsumptionModel, year: number, key: string): MonthRow[] => {
  const higherIsBetter = model.data.columns.find((c) => c.key === key)?.higherIsBetter ?? false;
  return MONTH_NAMES.map((name, i) => {
    const month = i + 1;
    const s = model.monthly.find((m) => m.year === year && m.month === month);
    const change = monthPctChange(model.monthly, year, month, key);
    return {
      month,
      name,
      total: s ? (s.totalByKey[key] ?? 0) : null,
      avgPerDay: s ? (s.avgPerDayByKey[key] ?? 0) : null,
      change,
      good: change === null ? null : higherIsBetter ? change > 0 : change < 0,
      days: s?.daysCount ?? null,
    };
  });
};

export interface CompareSeries {
  year: number;
  values: (number | null)[];
}

export const compareSeries = (
  model: ConsumptionModel,
  key: string,
  mode: CompareMode,
): CompareSeries[] =>
  compareYearData(model.monthly, model.years, key, mode).map((values, i) => ({
    year: model.years[i] as number,
    values,
  }));

/** Whole numbers plain, otherwise two decimals; matches the web table. */
export const formatReading = (n: number): string => {
  if (!Number.isFinite(n)) return '–';
  return Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(2);
};

// ─── Remove a meter ──────────────────────────────────────────────────────────

/** Splits on commas outside quotes and `[...]`, keeping every character so the line round-trips. */
const splitRaw = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let depth = 0;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '[') depth++;
    else if (!quoted && ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && !quoted && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
};

const columnKey = (cell: string): string => (cell.split('[')[0] ?? '').trim();

/** Drops a meter's column from the header and every row; other lines are left byte-for-byte. */
export const removeConsumptionMeter = (content: string, key: string): TileResult => {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.trim());
  const header = lines[headerAt];
  if (header === undefined) return { ok: false, error: 'Meter not found.' };
  const idx = splitRaw(header).findIndex((c, i) => i > 0 && columnKey(c) === key);
  if (idx < 0) return { ok: false, error: 'Meter not found.' };
  const next = lines.map((l, i) => {
    if (i < headerAt || !l.trim()) return l;
    const cells = splitRaw(l);
    cells.splice(idx, 1);
    return cells.join(',');
  });
  return { ok: true, content: next.join(eol) };
};
