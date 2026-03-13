// Column header encoding: ColName[title:Display;unit:kWh;yearlyTarget:3500]
// If no brackets, column name is used as title with no unit/target.
//
// Two supported file formats:
//   New (single date col):  created,ColA[...],ColB[...]
//   Old (two date cols):    Zeitstempel,Datum,ColA[...],ColB[...]
//
// Format is auto-detected: if the 2nd header column contains '[' or there is
// only 1 header column, the file is in new format.

export interface ColumnMeta {
  rawKey: string; // original header string (may include [...])
  key: string; // decoded column name
  title: string;
  unit: string;
  yearlyTarget: number; // 0 = not set
  higherIsBetter: boolean; // false = less is better (default), true = more is better
}

export interface DailyEntry {
  date: string; // YYYY-MM-DD
  readings: Record<string, number>; // absolute meter readings (NaN = missing)
  deltas: Record<string, number>; // daily consumption (reading[n] - reading[n-1])
  interpolated: boolean; // true = gap-filled, not original data
}

export interface ConsumptionData {
  rawHeaderLine: string; // preserved for round-trip serialization
  firstColName: string; // e.g. 'created' or 'Zeitstempel'
  secondColName: string; // e.g. 'Datum' for old format, '' for new format
  columns: ColumnMeta[];
  entries: DailyEntry[];
}

export interface MonthlyStats {
  year: number;
  month: number;
  totalByKey: Record<string, number>;
  avgPerDayByKey: Record<string, number>;
  daysCount: number;
}

export interface YearlyStats {
  year: number;
  totalByKey: Record<string, number>;
  avgPerDayByKey: Record<string, number>;
  daysCount: number;
}

// --- Helpers ---

function parseColumnMeta(header: string): ColumnMeta {
  const bracketIdx = header.indexOf('[');
  if (bracketIdx === -1) {
    return {
      rawKey: header,
      key: header.trim(),
      title: header.trim(),
      unit: '',
      yearlyTarget: 0,
      higherIsBetter: false,
    };
  }
  const key = header.slice(0, bracketIdx).trim();
  const closeIdx = header.lastIndexOf(']');
  const metaStr = closeIdx > bracketIdx ? header.slice(bracketIdx + 1, closeIdx) : '';
  const meta: Record<string, string> = {};
  for (const part of metaStr.split(';')) {
    const colonIdx = part.indexOf(':');
    if (colonIdx > 0) {
      meta[part.slice(0, colonIdx).trim()] = part.slice(colonIdx + 1).trim();
    }
  }
  return {
    rawKey: header,
    key,
    title: meta.title ?? key,
    unit: meta.unit ?? '',
    yearlyTarget: meta.yearlyTarget ? Number(meta.yearlyTarget.replace(',', '.')) : 0,
    higherIsBetter: meta.higherIsBetter === 'true',
  };
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNum(s: string): number {
  if (!s) return NaN;
  // Handle German decimal separator (comma) inside quotes: "19154,515" → 19154.515
  return Number(s.replace(',', '.'));
}

function parseDDMMYYYY(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse YYYY-MM-DD or DD.MM.YYYY */
function parseDate(s: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, mo, da] = s.split('-').map(Number);
    if (!y || !mo || !da) return null;
    const d = new Date(y, mo - 1, da);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseDDMMYYYY(s);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function toDisplayDate(isoDate: string): string {
  const parts = isoDate.split('-');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// --- Core functions ---

export function parseConsumption(raw: string): { data: ConsumptionData; modified: boolean } {
  const lines = raw.split('\n').filter((l) => l.trim());
  const empty: ConsumptionData = {
    rawHeaderLine: '',
    firstColName: 'created',
    secondColName: '',
    columns: [],
    entries: [],
  };
  if (lines.length < 1) return { data: empty, modified: false };

  const headerLine = lines[0] ?? '';
  const allHeaders = parseCSVLine(headerLine);

  // Detect old format (Zeitstempel,Datum,...) vs new format (created,...).
  // Old format: 2nd column has no '[' (not a data column) AND first data row's
  // 2nd field matches DD.MM.YYYY. Also recognised by 'Zeitstempel' first col name.
  let isOldFormat = false;
  if (allHeaders.length >= 2 && !allHeaders[1]?.includes('[')) {
    if (lines.length >= 2) {
      const firstDataFields = parseCSVLine(lines[1] ?? '');
      isOldFormat = /^\d{1,2}\.\d{1,2}\.\d{4}/.test((firstDataFields[1] ?? '').trim());
    } else {
      // Header-only: fall back to column name heuristic
      isOldFormat = allHeaders[0] === 'Zeitstempel';
    }
  }

  const firstColName = allHeaders[0] ?? 'created';
  const secondColName = isOldFormat ? (allHeaders[1] ?? 'Datum') : '';
  const dataHeaders = isOldFormat ? allHeaders.slice(2) : allHeaders.slice(1);
  const columns: ColumnMeta[] = dataHeaders.map(parseColumnMeta);

  type RawRow = { date: Date; readings: Record<string, number> };
  const rawRows: RawRow[] = [];

  for (const line of lines.slice(1)) {
    const fields = parseCSVLine(line);
    let date: Date | null;
    if (isOldFormat) {
      if (fields.length < 2) continue;
      date = parseDDMMYYYY((fields[1] ?? '').trim());
    } else {
      if (fields.length < 1) continue;
      date = parseDate((fields[0] ?? '').trim());
    }
    if (!date) continue;

    const offset = isOldFormat ? 2 : 1;
    const readings: Record<string, number> = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (!col) continue;
      const val = (fields[i + offset] ?? '').trim();
      readings[col.key] = val !== '' ? parseNum(val) : NaN;
    }
    rawRows.push({ date, readings });
  }

  rawRows.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Deduplicate by date, keep last entry
  const deduped = new Map<string, RawRow>();
  for (const row of rawRows) {
    deduped.set(toISODate(row.date), row);
  }
  const sorted = Array.from(deduped.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  // Fill gaps with linear interpolation
  let modified = false;
  const filled: Array<RawRow & { interpolated: boolean }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const sortedRow = sorted[i];
    if (!sortedRow) continue;
    filled.push({ ...sortedRow, interpolated: false });
    if (i + 1 < sorted.length) {
      const curr = sortedRow;
      const next = sorted[i + 1];
      if (!next) continue;
      const gap = daysBetween(curr.date, next.date);
      if (gap > 1) {
        modified = true;
        for (let d = 1; d < gap; d++) {
          const t = d / gap;
          const interpDate = addDays(curr.date, d);
          const readings: Record<string, number> = {};
          for (const col of columns) {
            const r0 = curr.readings[col.key];
            const r1 = next.readings[col.key];
            if (r0 !== undefined && !Number.isNaN(r0) && r1 !== undefined && !Number.isNaN(r1)) {
              // On meter reset (r1 < r0) hold the previous value so delta = 0
              readings[col.key] = r1 < r0 ? r0 : r0 + (r1 - r0) * t;
            } else {
              readings[col.key] = NaN;
            }
          }
          filled.push({ date: interpDate, readings, interpolated: true });
        }
      }
    }
  }

  // Re-sort after inserting interpolated rows
  filled.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute daily deltas
  const entries: DailyEntry[] = filled.map((row, i) => {
    const prev = filled[i - 1];
    const deltas: Record<string, number> = {};
    for (const col of columns) {
      const curr = row.readings[col.key];
      const prevVal = prev?.readings[col.key];
      if (
        i === 0 ||
        curr === undefined ||
        Number.isNaN(curr) ||
        prevVal === undefined ||
        Number.isNaN(prevVal)
      ) {
        deltas[col.key] = 0;
      } else if (curr < prevVal) {
        // Meter reset — can't calculate meaningful delta
        deltas[col.key] = 0;
      } else {
        deltas[col.key] = curr - prevVal;
      }
    }
    return {
      date: toISODate(row.date),
      readings: { ...row.readings },
      deltas,
      interpolated: row.interpolated,
    };
  });

  return {
    data: { rawHeaderLine: headerLine, firstColName, secondColName, columns, entries },
    modified,
  };
}

export function serializeConsumption(data: ConsumptionData): string {
  const lines: string[] = [data.rawHeaderLine];
  for (const entry of data.entries) {
    const row: string[] = [];
    if (data.secondColName) {
      // Old format: write timestamp + DD.MM.YYYY date
      const displayDate = toDisplayDate(entry.date);
      row.push(`${displayDate} 00:00:00`, displayDate);
    } else {
      // New format: write ISO date only
      row.push(entry.date);
    }
    for (const col of data.columns) {
      const val = entry.readings[col.key];
      if (val === undefined || Number.isNaN(val)) {
        row.push('');
      } else {
        // Preserve integer format where the value is effectively whole
        row.push(
          Math.abs(val - Math.round(val)) < 0.0005 ? String(Math.round(val)) : val.toFixed(3),
        );
      }
    }
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

export function getMonthlyStats(data: ConsumptionData): MonthlyStats[] {
  const map = new Map<string, { year: number; month: number; entries: DailyEntry[] }>();
  for (const entry of data.entries) {
    const [y, mo] = entry.date.split('-');
    const key = `${y}-${mo}`;
    if (!map.has(key)) map.set(key, { year: Number(y), month: Number(mo), entries: [] });
    map.get(key)?.entries.push(entry);
  }

  const result: MonthlyStats[] = [];
  for (const { year, month, entries } of map.values()) {
    const totalByKey: Record<string, number> = {};
    const avgPerDayByKey: Record<string, number> = {};
    for (const col of data.columns) {
      const values = entries
        .map((e) => e.deltas[col.key] ?? 0)
        .filter((v) => !Number.isNaN(v) && Number.isFinite(v));
      totalByKey[col.key] = values.reduce((s, v) => s + v, 0);
      avgPerDayByKey[col.key] = values.length > 0 ? (totalByKey[col.key] ?? 0) / values.length : 0;
    }
    result.push({ year, month, totalByKey, avgPerDayByKey, daysCount: entries.length });
  }

  return result.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}

export function buildRawKey(meta: {
  key: string;
  title: string;
  unit: string;
  yearlyTarget: number;
  higherIsBetter?: boolean;
}): string {
  const parts: string[] = [];
  if (meta.title && meta.title !== meta.key) parts.push(`title:${meta.title}`);
  if (meta.unit) parts.push(`unit:${meta.unit}`);
  if (meta.yearlyTarget > 0) parts.push(`yearlyTarget:${meta.yearlyTarget}`);
  if (meta.higherIsBetter) parts.push('higherIsBetter:true');
  return parts.length > 0 ? `${meta.key}[${parts.join(';')}]` : meta.key;
}

function buildHeaderLine(data: ConsumptionData, columns: ColumnMeta[]): string {
  const metaCols = data.secondColName
    ? [data.firstColName, data.secondColName]
    : [data.firstColName];
  return [...metaCols, ...columns.map((c) => c.rawKey)].join(',');
}

export function addColumn(
  data: ConsumptionData,
  meta: {
    key: string;
    title: string;
    unit: string;
    yearlyTarget: number;
    higherIsBetter?: boolean;
  },
): ConsumptionData {
  const rawKey = buildRawKey(meta);
  const newCol: ColumnMeta = {
    rawKey,
    key: meta.key,
    title: meta.title || meta.key,
    unit: meta.unit,
    yearlyTarget: meta.yearlyTarget,
    higherIsBetter: meta.higherIsBetter ?? false,
  };
  const columns = [...data.columns, newCol];
  const rawHeaderLine = buildHeaderLine(data, columns);
  const entries = data.entries.map((entry) => ({
    ...entry,
    readings: { ...entry.readings, [meta.key]: NaN },
    deltas: { ...entry.deltas, [meta.key]: 0 },
  }));
  return { ...data, rawHeaderLine, columns, entries };
}

export function removeColumn(data: ConsumptionData, key: string): ConsumptionData {
  const columns = data.columns.filter((c) => c.key !== key);
  const rawHeaderLine = buildHeaderLine(data, columns);
  const entries = data.entries.map((entry) => {
    const readings = { ...entry.readings };
    const deltas = { ...entry.deltas };
    delete readings[key];
    delete deltas[key];
    return { ...entry, readings, deltas };
  });
  return { ...data, rawHeaderLine, columns, entries };
}

export function addConsumptionEntry(
  data: ConsumptionData,
  date: string,
  readings: Record<string, number>,
): ConsumptionData {
  if (data.entries.some((e) => e.date === date)) return data;

  const sorted = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
  const prevEntry = sorted.filter((e) => e.date < date).at(-1);

  const deltas: Record<string, number> = {};
  for (const col of data.columns) {
    const curr = readings[col.key];
    const prevVal = prevEntry?.readings[col.key];
    if (
      curr === undefined ||
      Number.isNaN(curr) ||
      prevVal === undefined ||
      Number.isNaN(prevVal)
    ) {
      deltas[col.key] = 0;
    } else if (curr < prevVal) {
      deltas[col.key] = 0;
    } else {
      deltas[col.key] = curr - prevVal;
    }
  }

  const newEntry: DailyEntry = { date, readings, deltas, interpolated: false };
  const entries = [...data.entries, newEntry].sort((a, b) => a.date.localeCompare(b.date));
  return { ...data, entries };
}

export function getYearlyStats(data: ConsumptionData): YearlyStats[] {
  const map = new Map<number, DailyEntry[]>();
  for (const entry of data.entries) {
    const year = Number(entry.date.slice(0, 4));
    if (!map.has(year)) map.set(year, []);
    map.get(year)?.push(entry);
  }

  const result: YearlyStats[] = [];
  for (const [year, entries] of map) {
    const totalByKey: Record<string, number> = {};
    const avgPerDayByKey: Record<string, number> = {};
    for (const col of data.columns) {
      const values = entries
        .map((e) => e.deltas[col.key] ?? 0)
        .filter((v) => !Number.isNaN(v) && Number.isFinite(v));
      totalByKey[col.key] = values.reduce((s, v) => s + v, 0);
      avgPerDayByKey[col.key] = values.length > 0 ? (totalByKey[col.key] ?? 0) / values.length : 0;
    }
    result.push({ year, totalByKey, avgPerDayByKey, daysCount: entries.length });
  }

  return result.sort((a, b) => a.year - b.year);
}
