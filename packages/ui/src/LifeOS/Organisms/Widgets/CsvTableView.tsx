import { ArrowDown, ArrowUp, Filter } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoLabel, MonoText } from '../../Atoms/Typography';

export interface CsvTableViewProps {
  content: string;
}

export const CsvTableView = ({ content }: CsvTableViewProps) => {
  const [sortConfig, setSortConfig] = useState<{ key: number; direction: 'asc' | 'desc' } | null>(
    null,
  );
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  const { headers, rows } = useMemo(() => {
    if (!content) return { headers: [], rows: [] };
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length === 0) return { headers: [], rows: [] };

    // Attempt to detect separator (comma or semicolon)
    const firstLine = lines[0];
    if (!firstLine) return { headers: [], rows: [] };

    const separator = firstLine.includes(';') ? ';' : ',';

    const headers = firstLine.split(separator).map((h) => {
      const trimmed = h.trim();
      // Decode bracket-encoded column metadata: ColName[title:X;unit:Y] → ColName
      const bracketIdx = trimmed.indexOf('[');
      return bracketIdx > 0 ? trimmed.slice(0, bracketIdx).trim() : trimmed;
    });
    const rows = lines.slice(1).map((line) => line.split(separator).map((c) => c.trim()));

    return { headers, rows };
  }, [content]);

  // Filtering
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return Object.entries(filters).every(([colIndex, filterValue]) => {
        const cellValue = row[parseInt(colIndex, 10)] || '';
        return cellValue.toLowerCase().includes(filterValue.toLowerCase());
      });
    });
  }, [rows, filters]);

  // Sorting
  const sortedRows = useMemo(() => {
    if (!sortConfig) return filteredRows;
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const valA = a[sortConfig.key] || '';
      const valB = b[sortConfig.key] || '';

      // Try numeric sort
      const numA = parseFloat(valA);
      const numB = parseFloat(valB);

      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }

      return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    return sorted;
  }, [filteredRows, sortConfig]);

  const handleSort = (index: number) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === index && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: index, direction });
  };

  const handleFilterChange = (index: number, value: string) => {
    setFilters((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[index];
        return next;
      }
      return { ...prev, [index]: value };
    });
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-[var(--los-bg)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-[var(--los-border)]">
        <MonoLabel className="text-xs">{rows.length} rows</MonoLabel>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'p-1 rounded hover:bg-[var(--los-border)] transition-colors',
            showFilters ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
          )}
          title="Toggle Filters"
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[var(--los-bg)] z-10 shadow-sm">
            <tr>
              {headers.map((header, i) => (
                <th key={header} className="p-2 border-b border-[var(--los-border)] min-w-[100px]">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 hover:text-[var(--los-accent)] w-full text-left group"
                      onClick={() => handleSort(i)}
                    >
                      <MonoLabel className="text-xs font-bold truncate uppercase">
                        {header}
                      </MonoLabel>
                      <span
                        className={cn(
                          'opacity-0 transition-opacity',
                          sortConfig?.key === i
                            ? 'opacity-100 text-[var(--los-accent)]'
                            : 'group-hover:opacity-50',
                        )}
                      >
                        {sortConfig?.key === i && sortConfig.direction === 'desc' ? (
                          <ArrowDown size={12} />
                        ) : (
                          <ArrowUp size={12} />
                        )}
                      </span>
                    </button>

                    {showFilters && (
                      <input
                        type="text"
                        placeholder={`Filter ${header}...`}
                        className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] rounded px-1 py-0.5 text-[10px] text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)]"
                        value={filters[i] || ''}
                        onInput={(e) => handleFilterChange(i, e.currentTarget.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.join('|')}
                className="hover:bg-[var(--los-border)]/10 transition-colors border-b border-[var(--los-border)]/50 last:border-0"
              >
                {headers.map((header, cIndex) => (
                  <td key={header} className="p-2 truncate max-w-[200px]" title={row[cIndex]}>
                    <MonoText className="text-xs">{row[cIndex]}</MonoText>
                  </td>
                ))}
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="p-8 text-center text-[var(--los-muted)]">
                  <MonoText>No data found</MonoText>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
