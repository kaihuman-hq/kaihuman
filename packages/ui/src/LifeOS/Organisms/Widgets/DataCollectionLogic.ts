/**
 * Logic for Data Collection Widget (.data-collection.csv)
 */

export interface ColumnDefinition {
  name: string;
  type: 'text' | 'number' | 'date' | 'auto:date' | 'auto:date:yesterday' | 'auto:number:sum' | 'auto:number:avg';
  unit?: string;
  isAuto?: boolean;
}

export type DataValue = string | number | Date | null;

export interface DataRow {
  [key: string]: DataValue;
}

export interface DataCollectionData {
  columns: ColumnDefinition[];
  rows: DataRow[];
}

/**
 * Parsing Logic
 * Format:
 * header1,type::text;header2,type::number,unit::€;...
 * val1;val2;...
 */
export const parseDataCollection = (csv: string): DataCollectionData => {
  if (!csv || !csv.trim()) {
    return { columns: [], rows: [] };
  }

  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return { columns: [], rows: [] };

  // Parse Header
  // Example: name::created,type::auto:date;name::Value,type::number,unit::€
  const headerLine = lines[0];
  if (!headerLine) return { columns: [], rows: [] };

  const columnDefs: ColumnDefinition[] = headerLine.split(';').map((colStr: string) => {
    const parts = colStr.split(',');
    const def: any = { name: '', type: 'text' }; // Default

    parts.forEach(part => {
      const [key, val] = part.split('::');
      if (key === 'name') def.name = val;
      if (key === 'type') def.type = val;
      if (key === 'unit') def.unit = val;
    });

    // Determine auto flag
    if (String(def.type).startsWith('auto:')) {
      def.isAuto = true;
    }

    return def as ColumnDefinition;
  });

  // Filter out invalid columns (no name)
  const validColumns = columnDefs.filter(c => !!c.name);

  // Parse Rows
  const rows: DataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const values = line.split(';');
    const row: DataRow = {};

    validColumns.forEach((col, index) => {
      const rawVal = values[index];

      if (col.type === 'number' || col.type === 'auto:number:sum' || col.type === 'auto:number:avg') {
        const num = parseFloat(rawVal || '0');
        row[col.name] = isNaN(num) ? 0 : num;
      } else if (col.type === 'date' || col.type === 'auto:date' || col.type === 'auto:date:yesterday') {
        // Try parsing ISO date
        // If rawVal is empty/invalid, we keep it as null or handle it?
        // For auto fields, they should be regenerated on save, but on read we trust the file?
        // Let's trust the file content for read.
        row[col.name] = rawVal || null;
      } else {
        row[col.name] = rawVal || null;
      }
    });
    rows.push(row);
  }

  return { columns: validColumns, rows };
};

export const serializeDataCollection = (data: DataCollectionData): string => {
  // Serialize Header
  const header = data.columns.map(col => {
    let part = `name::${col.name},type::${col.type}`;
    if (col.unit) part += `,unit::${col.unit}`;
    return part;
  }).join(';');

  const lines = [header];

  // Serialize Rows
  data.rows.forEach(row => {
    const line = data.columns.map(col => {
      const val = row[col.name];
      if (val === null || val === undefined) return '';
      return String(val);
    }).join(';');
    lines.push(line);
  });

  return lines.join('\n');
};

/**
 * Recalculate auto columns for a row
 */
export const calculateAutoValues = (row: DataRow, columns: ColumnDefinition[]): DataRow => {
  const newRow = { ...row };

  // First pass: Date autos (usually standalone)
  columns.forEach(col => {
    if (col.type === 'auto:date') {
      if (!newRow[col.name]) {
        newRow[col.name] = new Date().toISOString();
      }
    }
    if (col.type === 'auto:date:yesterday') {
      if (!newRow[col.name]) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        newRow[col.name] = d.toISOString();
      }
    }
  });

  // Second pass: Number aggs (sum/avg) depend on other number columns
  // "sum of all numbers" implies sum of all *other* number columns in this row?
  // The requirement says "sum/avg of all numbers". Assuming all *explicitly defined* number columns.
  const numberColumns = columns.filter(c => c.type === 'number');

  columns.forEach(col => {
    if (col.type === 'auto:number:sum') {
      const sum = numberColumns.reduce((acc, c) => acc + (Number(newRow[c.name]) || 0), 0);
      newRow[col.name] = sum;
    }
    if (col.type === 'auto:number:avg') {
      const total = numberColumns.reduce((acc, c) => acc + (Number(newRow[c.name]) || 0), 0);
      const avg = numberColumns.length > 0 ? total / numberColumns.length : 0;
      newRow[col.name] = avg; // Maybe round? default to full float for now
    }
  });

  return newRow;
};

export const recalculateAllRows = (rows: DataRow[], columns: ColumnDefinition[]): DataRow[] => {
  return rows.map(row => calculateAutoValues(row, columns));
};

export const addColumn = (data: DataCollectionData, newCol: ColumnDefinition): DataCollectionData => {
  if (data.columns.some(c => c.name === newCol.name)) {
    throw new Error(`Column "${newCol.name}" already exists.`);
  }
  const newColumns = [...data.columns, newCol];
  // Backfill rows
  const newRows = data.rows.map(row => ({
    ...row,
    [newCol.name]: null
  } as DataRow));

  return {
    columns: newColumns,
    rows: recalculateAllRows(newRows, newColumns)
  };
};

export const updateColumn = (data: DataCollectionData, oldName: string, newCol: ColumnDefinition): DataCollectionData => {
  const colIndex = data.columns.findIndex(c => c.name === oldName);
  if (colIndex === -1) throw new Error(`Column "${oldName}" not found.`);

  // Check name collision if renaming
  if (oldName !== newCol.name && data.columns.some(c => c.name === newCol.name)) {
    throw new Error(`Column "${newCol.name}" already exists.`);
  }

  const newColumns = [...data.columns];
  newColumns[colIndex] = newCol;

  let newRows = data.rows;
  if (oldName !== newCol.name) {
    // Rename key in rows
    newRows = data.rows.map(row => {
      const { [oldName]: val, ...rest } = row;
      return { ...rest, [newCol.name]: val } as DataRow;
    });
  }

  return {
    columns: newColumns,
    rows: recalculateAllRows(newRows, newColumns)
  };
};

export const deleteColumn = (data: DataCollectionData, colName: string): DataCollectionData => {
  const newColumns = data.columns.filter(c => c.name !== colName);
  const newRows = data.rows.map(row => {
    const { [colName]: _, ...rest } = row;
    return rest;
  });

  return {
    columns: newColumns,
    rows: recalculateAllRows(newRows, newColumns)
  };
};

/**
 * Filter rows by time.
 * Logic: Find the FIRST column that is basically a date (date, auto:date, auto:date:yesterday).
 * Return rows that match the year criteria.
 */
export type TimeFilterMode = 'ALL' | 'YTD' | 'LAST_YEAR' | 'LAST_6_MONTHS' | 'LAST_12_MONTHS';

/**
 * Filter rows by time.
 * Logic: Find the FIRST column that is basically a date (date, auto:date, auto:date:yesterday).
 * Return rows that match the criteria.
 */
export const filterDataByTime = (data: DataCollectionData, mode: TimeFilterMode): DataRow[] => {
  if (mode === 'ALL') return data.rows;

  const dateCol = data.columns.find(c => ['date', 'auto:date', 'auto:date:yesterday'].includes(c.type));
  if (!dateCol) return data.rows; // No date column found, return all

  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;

  // Calculate cutoff dates for relative ranges
  const getCutoffDate = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  return data.rows.filter(row => {
    const val = row[dateCol.name];
    if (!val) return false;

    const d = new Date(String(val));
    if (isNaN(d.getTime())) return false;

    if (mode === 'YTD') {
      return d.getFullYear() === currentYear;
    }
    if (mode === 'LAST_YEAR') {
      return d.getFullYear() === lastYear;
    }
    if (mode === 'LAST_6_MONTHS') {
      return d >= getCutoffDate(6);
    }
    if (mode === 'LAST_12_MONTHS') {
      return d >= getCutoffDate(12);
    }

    return true;
  });
};
