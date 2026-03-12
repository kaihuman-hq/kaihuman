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
  return lines.join('\n') + (lines.length ? '\n' : '');
}

export function addEntry(content: string, value: number, invest: number, date?: Date): string {
  const entries = parseStocks(content);
  entries.push({ timestamp: date ?? new Date(), value, invest });
  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return serializeStocks(entries);
}

// ─── Period key helpers ────────────────────────────────────────────────────────

function getWeekKey(d: Date): string {
  // ISO week number
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
  if (period === 'weekly') return key.replace(/^\d{4}-/, ''); // W12
  if (period === 'monthly') {
    const [, mm] = key.split('-');
    return mm ?? key;
  }
  return key;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function aggregateByPeriod(entries: StockEntry[], period: StockPeriod): PeriodPoint[] {
  if (entries.length === 0) return [];

  // Latest entry per period
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

  return {
    latestValue: latest.value,
    latestInvest: latest.invest,
    latestProfit,
    latestProfitPct,
    changeVsPrev,
    changeVsPrevPct,
  };
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

export interface ForecastResult {
  yearEndValue: number;
  r2: number; // coefficient of determination
}

/** Linear regression on all entries, project to Dec 31 of current year. */
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

  // R²
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * (xs[i] as number) + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { yearEndValue, r2 };
}
