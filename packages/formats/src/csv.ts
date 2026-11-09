/** RFC 4180-ish: quoted fields, `""` escapes, CRLF, newlines inside quotes; a trailing newline adds no row. */
export const parseCsv = (text: string, delimiter = ','): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let touched = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
      touched = true;
    } else if (c === delimiter) {
      endField();
      touched = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += c;
      touched = true;
    }
  }
  if (touched || field !== '') endRow();
  return rows;
};

/** Rows shown per page by the CSV table views (web and mobile). */
export const CSV_PAGE_SIZE = 50;

export interface CsvTableData {
  headers: string[];
  rows: unknown[][];
}

export type CsvSort = { key: number; direction: 'asc' | 'desc' };
/** Column index -> case-insensitive substring; empty filters are absent. */
export type CsvFilters = Readonly<Record<number, string>>;

const isComplex = (v: unknown): v is object => typeof v === 'object' && v !== null;

/** True for cells holding structured data (shown as JSON and expandable). */
export const isComplexCell = isComplex;

/** What a cell shows in a table: objects as clipped JSON, everything else as text. */
export const csvCellText = (v: unknown): string => {
  if (isComplex(v)) {
    const s = JSON.stringify(v);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  }
  return String(v ?? '');
};

/** Splits on `separator` outside `[...]`, so bracket metadata like `[title:X;unit:Y]` stays whole. */
const splitHeader = (line: string, separator: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of line) {
    if (c === '[') depth++;
    else if (c === ']' && depth > 0) depth--;
    if (c === separator && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
};

/** `ColName[title:X;unit:Y]` -> `ColName`. */
export const stripHeaderMeta = (header: string): string => {
  const trimmed = header.trim();
  const i = trimmed.indexOf('[');
  return i > 0 ? trimmed.slice(0, i).trim() : trimmed;
};

/**
 * Parses widget/generic CSV text for table display. The separator is `;` or `,` (detected on the
 * header with bracket metadata ignored) unless `delimiter` is given; header metadata is stripped.
 */
export const parseCsvTable = (content: string, delimiter?: string): CsvTableData => {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l);
  const first = lines[0];
  if (first === undefined) return { headers: [], rows: [] };
  const separator = delimiter ?? (first.replace(/\[[^\]]*\]/g, '').includes(';') ? ';' : ',');
  const headers = splitHeader(first, separator).map(stripHeaderMeta);
  const rows = parseCsv(lines.slice(1).join('\n'), separator).map((r) => r.map((c) => c.trim()));
  return { headers, rows };
};

export const filterCsvRows = (rows: readonly unknown[][], filters: CsvFilters): unknown[][] => {
  const active = Object.entries(filters).filter(([, v]) => v);
  if (active.length === 0) return [...rows];
  return rows.filter((row) =>
    active.every(([col, value]) =>
      csvCellText(row[Number.parseInt(col, 10)]).toLowerCase().includes(value.toLowerCase()),
    ),
  );
};

/** Numeric when both cells parse as numbers, otherwise locale string order. Stable; input untouched. */
export const sortCsvRows = (rows: readonly unknown[][], sort: CsvSort | null): unknown[][] => {
  if (!sort) return [...rows];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = csvCellText(a[sort.key]);
    const y = csvCellText(b[sort.key]);
    const nx = Number.parseFloat(x);
    const ny = Number.parseFloat(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return sign * (nx - ny);
    return sign * x.localeCompare(y);
  });
};

/** Header tap: a new column sorts ascending, the same column flips direction. */
export const nextCsvSort = (current: CsvSort | null, key: number): CsvSort => ({
  key,
  direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
});

/** Sets or (for an empty value) removes one column's filter. */
export const setCsvFilter = (filters: CsvFilters, key: number, value: string): CsvFilters => {
  const next = { ...filters };
  if (value) next[key] = value;
  else delete next[key];
  return next;
};

export interface CsvPage {
  rows: unknown[][];
  /** Clamped to the valid range. */
  page: number;
  totalPages: number;
}

export const pageCsvRows = (
  rows: readonly unknown[][],
  page: number,
  size = CSV_PAGE_SIZE,
): CsvPage => {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.max(0, Math.min(page, totalPages - 1));
  return { rows: rows.slice(safe * size, (safe + 1) * size), page: safe, totalPages };
};

/** Filter, then sort: the order the table applies them. */
export const csvTableRows = (
  rows: readonly unknown[][],
  filters: CsvFilters,
  sort: CsvSort | null,
): unknown[][] => sortCsvRows(filterCsvRows(rows, filters), sort);
