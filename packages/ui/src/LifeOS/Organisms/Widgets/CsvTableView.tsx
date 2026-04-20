import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Filter } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoLabel, MonoText } from '../../Atoms/Typography';

const PAGE_SIZE = 50;

function isComplex(v: unknown): v is object {
  return typeof v === 'object' && v !== null;
}

function cellDisplay(v: unknown): string {
  if (isComplex(v)) {
    const s = JSON.stringify(v);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  }
  return String(v ?? '');
}

export interface CsvTableViewProps {
  content?: string;
  data?: { headers: string[]; rows: unknown[][] };
}

export const CsvTableView = ({ content, data }: CsvTableViewProps) => {
  const [sortConfig, setSortConfig] = useState<{ key: number; direction: 'asc' | 'desc' } | null>(
    null,
  );
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<unknown[] | null>(null);

  const { headers, rows } = useMemo(() => {
    if (data) return data;
    if (!content) return { headers: [], rows: [] as unknown[][] };
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length === 0) return { headers: [], rows: [] as unknown[][] };

    const firstLine = lines[0];
    if (!firstLine) return { headers: [], rows: [] as unknown[][] };

    // Strip bracket metadata before detecting separator to avoid semicolons
    // inside [...] being mistaken for the field separator.
    const lineForSepDetect = firstLine.replace(/\[[^\]]*\]/g, '');
    const separator = lineForSepDetect.includes(';') ? ';' : ',';

    const headers = firstLine.split(separator).map((h) => {
      const trimmed = h.trim();
      // Decode bracket-encoded column metadata: ColName[title:X;unit:Y] → ColName
      const bracketIdx = trimmed.indexOf('[');
      return bracketIdx > 0 ? trimmed.slice(0, bracketIdx).trim() : trimmed;
    });
    const rows: unknown[][] = lines
      .slice(1)
      .map((line) => line.split(separator).map((c) => c.trim()));

    return { headers, rows };
  }, [content, data]);

  // Filtering
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return Object.entries(filters).every(([colIndex, filterValue]) => {
        const cellValue = cellDisplay(row[Number.parseInt(colIndex, 10)]);
        return cellValue.toLowerCase().includes(filterValue.toLowerCase());
      });
    });
  }, [rows, filters]);

  // Sorting
  const sortedRows = useMemo(() => {
    if (!sortConfig) return filteredRows;
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const valA = cellDisplay(a[sortConfig.key]);
      const valB = cellDisplay(b[sortConfig.key]);

      const numA = parseFloat(valA);
      const numB = parseFloat(valB);

      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }

      return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    return sorted;
  }, [filteredRows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRows = sortedRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleSort = (index: number) => {
    setPage(0);
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === index && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: index, direction });
  };

  const handleFilterChange = (index: number, value: string) => {
    setPage(0);
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
        <MonoLabel className="text-xs">{sortedRows.length} rows</MonoLabel>
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
                <th
                  key={`h-${i}-${header}`}
                  className="p-2 border-b border-[var(--los-border)] min-w-[100px]"
                >
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
            {pagedRows.map((row, rowIdx) => {
              const hasComplex = row.some(isComplex);
              const isExpanded = expandedRow === row;
              return (
                <>
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: page-relative index is stable within this render
                    key={rowIdx}
                    onClick={() => hasComplex && setExpandedRow(isExpanded ? null : row)}
                    className={cn(
                      'transition-colors border-b border-[var(--los-border)]/50 last:border-0',
                      hasComplex
                        ? 'cursor-pointer hover:bg-[var(--los-accent)]/5'
                        : 'hover:bg-[var(--los-border)]/10',
                      isExpanded && 'bg-[var(--los-accent)]/5',
                    )}
                  >
                    {headers.map((header, cIndex) => {
                      const val = row[cIndex];
                      const display = cellDisplay(val);
                      return (
                        <td
                          key={`c-${cIndex}-${header}`}
                          className="p-2 truncate max-w-[200px]"
                          title={isComplex(val) ? JSON.stringify(val) : display}
                        >
                          <MonoText
                            className={cn('text-xs', isComplex(val) && 'text-[var(--los-accent)]')}
                          >
                            {display}
                          </MonoText>
                        </td>
                      );
                    })}
                  </tr>
                  {isExpanded && (
                    <tr
                      // biome-ignore lint/suspicious/noArrayIndexKey: page-relative index is stable within this render
                      key={`${rowIdx}-expanded`}
                    >
                      <td colSpan={headers.length} className="p-0">
                        <div className="p-3 border-b border-[var(--los-border)] bg-[var(--los-bg)]">
                          <div className="flex flex-col gap-2">
                            {headers.map((header, cIndex) => {
                              const val = row[cIndex];
                              if (!isComplex(val)) return null;
                              return (
                                <div key={header}>
                                  <MonoLabel className="text-[10px] uppercase text-[var(--los-muted)] mb-1 block">
                                    {header}
                                  </MonoLabel>
                                  <pre className="text-xs font-mono text-[var(--los-fg)] whitespace-pre-wrap break-all bg-[var(--los-border)]/10 p-2 rounded">
                                    {JSON.stringify(val, null, 2)}
                                  </pre>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {pagedRows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="p-8 text-center text-[var(--los-muted)]">
                  <MonoText>No data found</MonoText>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--los-border)] shrink-0">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {safePage + 1} / {totalPages} ({sortedRows.length} rows)
          </MonoText>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
