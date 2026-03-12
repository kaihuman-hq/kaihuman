/**
 * Logic for the Stocks Widget (.stocks.csv)
 *
 * Format: semicolon-delimited CSV, no mandatory header
 *   timestamp;value;invest
 *
 * Timestamps accepted:
 *   - German: DD.MM.YYYY HH:MM:SS  or  DD.MM.YYYY
 *   - ISO:    YYYY-MM-DD HH:MM:SS  or  YYYY-MM-DD
 *
 * Aggregation: only the LATEST entry per period (week/month/year) is used.
 */

export interface StockEntry {
  timestamp: Date;
  value: number;
  invest: number;
}

export interface PeriodPoint {
  label: string;
  value: number;
  invest: number;
  profit: number;
  profitPct: number | null; // % vs previous period
}

export type StockPeriod = 'weekly' | 'monthly' | 'yearly';

// ─── Parse ────────────────────────────────────────────────────────────────────

function parseTimestamp(raw: string): Date | null {
  const s = raw.trim();

  // German: DD.MM.YYYY [HH:MM:SS]
  const deMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (deMatch) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = deMatch;
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
  }

  // ISO: YYYY-MM-DD [HH:MM:SS]
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
  if (isoMatch) {
    return new Date(`${isoMatch[1]}T${isoMatch[2] ?? '00:00:00'}`);
  }

  return null;
}

export function parseStocks(content: string): StockEntry[] {
  if (!content.trim()) return [];

  const entries: StockEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(';');
    if (parts.length < 2) continue;

    // Skip header line
    const first = (parts[0] ?? '').trim().toLowerCase();
    if (first === 'timestamp' || first === 'zeitstempel') continue;

    const ts = parseTimestamp(parts[0] ?? '');
    if (!ts) continue;

    const value = Number.parseFloat((parts[1] ?? '0').replace(',', '.').trim());
    const invest =
      parts[2] !== undefined ? Number.parseFloat(parts[2].replace(',', '.').trim()) : 0;
    if (Number.isNaN(value)) continue;

    entries.push({ timestamp: ts, value, invest: Number.isNaN(invest) ? 0 : invest });
  }

  return entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export function serializeStocks(entries: StockEntry[]): string {
  const lines = entries.map((e) => {
    const d = e.timestamp;
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${ts};${e.value};${e.invest}`;
  });
  return `${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

export function addEntry(content: string, value: number, invest: number, date?: Date): string {
  const entries = parseStocks(content);
  entries.push({ timestamp: date ?? new Date(), value, invest });
  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return serializeStocks(entries);
}

// ─── Period key helpers ────────────────────────────────────────────────────────

function getWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getYearKey(d: Date): string {
  return `${d.getFullYear()}`;
}

function periodKey(d: Date, period: StockPeriod): string {
  if (period === 'weekly') return getWeekKey(d);
  if (period === 'monthly') return getMonthKey(d);
  return getYearKey(d);
}

function shortLabel(key: string, period: StockPeriod): string {
  if (period === 'weekly') return key.replace(/^\d{4}-/, '');
  if (period === 'monthly') {
    const [, mm] = key.split('-');
    return mm ?? key;
  }
  return key;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function aggregateByPeriod(entries: StockEntry[], period: StockPeriod): PeriodPoint[] {
  if (entries.length === 0) return [];

  const map = new Map<string, StockEntry>();
  for (const e of entries) {
    map.set(periodKey(e.timestamp, period), e);
  }

  const keys = [...map.keys()].sort();
  const points: PeriodPoint[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as string;
    const entry = map.get(key) as StockEntry;
    const prev = i > 0 ? (map.get(keys[i - 1] as string) as StockEntry) : null;
    const profit = entry.value - entry.invest;
    const profitPct = prev ? ((entry.value - prev.value) / prev.value) * 100 : null;

    points.push({
      label: shortLabel(key, period),
      value: entry.value,
      invest: entry.invest,
      profit,
      profitPct,
    });
  }

  return points;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface StockStats {
  latestValue: number;
  latestInvest: number;
  latestProfit: number;
  latestProfitPct: number;
  changeVsPrev: number | null;
  changeVsPrevPct: number | null;
  /** Compound Annual Growth Rate (requires ≥2 entries spanning >1 year) */
  cagr: number | null;
  /** All-time high value across all entries */
  allTimeHigh: number;
  /** Drawdown from ATH as a negative percentage */
  drawdownPct: number;
}

export function getStats(entries: StockEntry[]): StockStats | null {
  if (entries.length === 0) return null;
  const latest = entries[entries.length - 1] as StockEntry;
  const prev = entries.length > 1 ? (entries[entries.length - 2] as StockEntry) : null;

  const latestProfit = latest.value - latest.invest;
  const latestProfitPct = latest.invest > 0 ? (latestProfit / latest.invest) * 100 : 0;
  const changeVsPrev = prev ? latest.value - prev.value : null;
  const changeVsPrevPct =
    prev && prev.value > 0 ? ((latest.value - prev.value) / prev.value) * 100 : null;

  // CAGR: only meaningful if span ≥ 1 year
  let cagr: number | null = null;
  const first = entries[0] as StockEntry;
  const yearsElapsed =
    (latest.timestamp.getTime() - first.timestamp.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (yearsElapsed >= 1 && first.value > 0) {
    cagr = ((latest.value / first.value) ** (1 / yearsElapsed) - 1) * 100;
  }

  // ATH and drawdown
  const allTimeHigh = Math.max(...entries.map((e) => e.value));
  const drawdownPct = allTimeHigh > 0 ? ((latest.value - allTimeHigh) / allTimeHigh) * 100 : 0;

  return {
    latestValue: latest.value,
    latestInvest: latest.invest,
    latestProfit,
    latestProfitPct,
    changeVsPrev,
    changeVsPrevPct,
    cagr,
    allTimeHigh,
    drawdownPct,
  };
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

/** A projected period point (future, not observed). */
export interface ForecastPoint {
  label: string;
  value: number;
}

export interface PeriodForecast {
  /** Future periods projected until year-end (or next 2 years for yearly). */
  forecastPoints: ForecastPoint[];
  /** Projected value on the last period of the current year. null if no future periods. */
  yearEndValue: number | null;
  /** Projected profit at year-end based on latest known invest amount. */
  yearEndProfit: number | null;
  /** Average period-over-period growth used as basis for the trend. */
  avgGrowthPct: number;
  /** How many remaining periods are projected. */
  periodsRemaining: number;
  /** R² of the linear fit on recent aggregated data. */
  r2: number;
}

// How many past periods to include in the regression per time scale.
const LOOKBACK: Record<StockPeriod, number> = {
  weekly: 52,
  monthly: 24,
  yearly: 999,
};

function linearRegressionOnIndices(ys: number[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };

  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * ((ys[i] as number) - meanY);
    den += (i - meanX) ** 2;
  }
  if (den === 0) return { slope: 0, intercept: meanY, r2: 0 };

  const slope = num / den;
  const intercept = meanY - slope * meanX;

  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  return { slope, intercept, r2 };
}

function getRemainingPeriodLabels(period: StockPeriod, after: Date): string[] {
  const today = after;
  const year = today.getFullYear();
  const labels: string[] = [];

  if (period === 'monthly') {
    // Remaining full months after the current one
    const currentMonth = today.getMonth(); // 0-based
    for (let m = currentMonth + 1; m <= 11; m++) {
      labels.push(String(m + 1).padStart(2, '0'));
    }
  } else if (period === 'weekly') {
    const currentWeekKey = getWeekKey(today);
    const currentWeek = parseInt(currentWeekKey.split('-W')[1] ?? '0', 10);
    for (let w = currentWeek + 1; w <= 52; w++) {
      labels.push(`W${String(w).padStart(2, '0')}`);
    }
  } else {
    // yearly: project the next 2 years
    labels.push(String(year + 1));
    labels.push(String(year + 2));
  }

  return labels;
}

/**
 * Build a period-aware forecast using linear regression on aggregated period indices.
 *
 * Lookback window: 52 weeks / 24 months / all years.
 * Projects forward through remaining periods of the current year (weekly/monthly)
 * or the next 2 years (yearly).
 */
export function buildPeriodForecast(
  aggregated: PeriodPoint[],
  period: StockPeriod,
): PeriodForecast | null {
  if (aggregated.length < 2) return null;

  const recent = aggregated.slice(-LOOKBACK[period]);
  const ys = recent.map((p) => p.value);
  const { slope, intercept, r2 } = linearRegressionOnIndices(ys);

  // Average period-over-period % growth
  const growthRates: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1] as PeriodPoint;
    const curr = recent[i] as PeriodPoint;
    if (prev.value > 0) growthRates.push(((curr.value - prev.value) / prev.value) * 100);
  }
  const avgGrowthPct =
    growthRates.length > 0 ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0;

  // Remaining period labels from the last known aggregated period's date perspective
  const remainingLabels = getRemainingPeriodLabels(period, new Date());
  const periodsRemaining = remainingLabels.length;

  // Project forward from the end of the lookback window
  const baseIndex = recent.length;
  const forecastPoints: ForecastPoint[] = remainingLabels.map((label, i) => ({
    label,
    value: Math.max(0, slope * (baseIndex + i) + intercept),
  }));

  const lastForecast = forecastPoints[forecastPoints.length - 1];
  const yearEndValue = lastForecast ? lastForecast.value : null;

  const latestInvest = (aggregated[aggregated.length - 1] as PeriodPoint).invest;
  const yearEndProfit = yearEndValue !== null ? yearEndValue - latestInvest : null;

  return {
    forecastPoints,
    yearEndValue,
    yearEndProfit,
    avgGrowthPct,
    periodsRemaining,
    r2,
  };
}

/**
 * Legacy: linear regression on raw timestamps → year-end projection.
 * Kept for backward compatibility. Prefer buildPeriodForecast for display.
 */
export interface ForecastResult {
  yearEndValue: number;
  r2: number;
}

export function forecastYearEnd(entries: StockEntry[]): ForecastResult | null {
  if (entries.length < 2) return null;

  const xs = entries.map((e) => e.timestamp.getTime());
  const ys = entries.map((e) => e.value);
  const n = xs.length;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ((xs[i] as number) - meanX) * ((ys[i] as number) - meanY);
    den += ((xs[i] as number) - meanX) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  const intercept = meanY - slope * meanX;

  const yearEnd = new Date(new Date().getFullYear(), 11, 31).getTime();
  const yearEndValue = slope * yearEnd + intercept;

  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * (xs[i] as number) + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { yearEndValue, r2 };
}
