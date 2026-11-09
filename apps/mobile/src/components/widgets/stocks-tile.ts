/**
 * Stocks tile: headline figures, per-period aggregation, the chart series the web widget draws
 * (grouped bars, value, change, forecast) and the add-value mutator. Parsing, aggregation and the
 * forecast model stay in `@kaihuman/formats/stocks`, shared with the web widget.
 */
import { localDate } from '@kaihuman/formats';
import {
  addEntry as addStockEntry,
  aggregateByPeriod,
  buildPeriodForecast,
  getStats,
  type PeriodForecast,
  type PeriodPoint,
  parseStocks,
  type StockPeriod,
} from '@kaihuman/formats/stocks';
import type { TileResult } from './tile-controllers.js';

export type { PeriodForecast, PeriodPoint, StockPeriod } from '@kaihuman/formats/stocks';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ok = (content: string): TileResult => ({ ok: true, content });
const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
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
  /** Linear-trend projection per period (the rest of this year), null below two periods. */
  forecasts: Record<StockPeriod, PeriodForecast | null>;
}

/**
 * Parsing is shared with the web, which writes `DD.MM.YYYY HH:MM:SS` stamps; an ISO-only
 * parser here dropped every row of a web-written file and the tile showed no data.
 */
export const stocksView = (content: string, now: Date = new Date()): StocksView | null => {
  const entries = parseStocks(content);
  const stats = getStats(entries);
  if (!stats) return null;
  let invested = 0;
  const series = entries.map((e) => {
    invested += e.invest;
    return { date: localDate(e.timestamp), value: e.value, invested };
  });
  const periods = {
    weekly: aggregateByPeriod(entries, 'weekly'),
    monthly: aggregateByPeriod(entries, 'monthly'),
    yearly: aggregateByPeriod(entries, 'yearly'),
  };
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
    periods,
    forecasts: {
      weekly: buildPeriodForecast(periods.weekly, 'weekly', now),
      monthly: buildPeriodForecast(periods.monthly, 'monthly', now),
      yearly: buildPeriodForecast(periods.yearly, 'yearly', now),
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

// ─── Charts ──────────────────────────────────────────────────────────────────

export type StockChart = 'bars' | 'value' | 'change' | 'forecast';

/** How many periods the bar chart shows; weekly files would otherwise draw hairline bars. */
export const BAR_LIMIT = 24;

export interface StockBarGroup {
  label: string;
  /** Invested, value, profit (floored at zero, as the web draws it). */
  values: [number, number, number];
}

export const barGroups = (points: readonly PeriodPoint[]): StockBarGroup[] =>
  points.slice(-BAR_LIMIT).map((p) => ({
    label: p.label,
    values: [p.invest, p.value, Math.max(p.profit, 0)],
  }));

/** Percent change against the previous period; the first period has none and plots as zero. */
export const changeValues = (points: readonly PeriodPoint[]): number[] =>
  points.map((p) => p.profitPct ?? 0);

/** At most ~8 labels along the x axis, always including the last slot. */
export const axisLabels = (labels: readonly string[]): string[] => {
  const step = Math.max(Math.ceil(labels.length / 8), 1);
  return labels.map((l, i) => (i % step === 0 || i === labels.length - 1 ? l : ''));
};

export interface ForecastChartData {
  /** Observed values, then `null` for the projected slots. */
  history: (number | null)[];
  /** `null` for observed slots except the last, which anchors the dashed line. */
  projected: (number | null)[];
  labels: string[];
}

export const forecastChart = (
  points: readonly PeriodPoint[],
  forecast: PeriodForecast | null,
): ForecastChartData => {
  const future = forecast?.forecastPoints ?? [];
  const n = points.length;
  return {
    history: [...points.map((p) => p.value), ...future.map(() => null)],
    projected:
      future.length === 0
        ? []
        : [
            ...points.map((_, i) => (i === n - 1 ? (points[i] as PeriodPoint).value : null)),
            ...future.map((f) => f.value),
          ],
    labels: [...points.map((p) => p.label), ...future.map((f) => f.label)],
  };
};

export interface ForecastRow {
  label: string;
  value: number;
  /** Projected value minus the current value. */
  vsCurrent: number;
  /** Projected value minus everything invested so far. */
  profit: number;
}

export const forecastRows = (
  forecast: PeriodForecast | null,
  latestValue: number,
  invested: number,
): ForecastRow[] =>
  (forecast?.forecastPoints ?? []).map((f) => ({
    label: f.relativeLabel,
    value: f.value,
    vsCurrent: f.value - latestValue,
    profit: f.value - invested,
  }));

/** Lookback the forecast regresses over, for the model note. */
export const FORECAST_LOOKBACK: Record<StockPeriod, string> = {
  weekly: '52w',
  monthly: '24mo',
  yearly: 'all',
};
