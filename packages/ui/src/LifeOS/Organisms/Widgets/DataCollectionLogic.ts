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
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(';');
    const row: DataRow = {};

    validColumns.forEach((col, index) => {
      const rawVal = values[index];

      if (col.type === 'number' || col.type === 'auto:number:sum' || col.type === 'auto:number:avg') {
        const num = parseFloat(rawVal);
        row[col.name] = isNaN(num) ? 0 : num;
      } else if (col.type === 'date' || col.type === 'auto:date' || col.type === 'auto:date:yesterday') {
        // Try parsing ISO date
        // If rawVal is empty/invalid, we keep it as null or handle it?
        // For auto fields, they should be regenerated on save, but on read we trust the file?
        // Let's trust the file content for read.
        row[col.name] = rawVal;
      } else {
        row[col.name] = rawVal;
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
