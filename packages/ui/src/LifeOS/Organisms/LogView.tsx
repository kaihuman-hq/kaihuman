import { ChevronLeft, ChevronRight } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoLabel, MonoText } from '../Atoms/Typography';

function isComplex(v: unknown): v is object {
  return typeof v === 'object' && v !== null;
}

function cellDisplay(v: unknown): string {
  if (isComplex(v)) {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  return String(v ?? '');
}

const PAGE_SIZE = 50;

const TIMESTAMP_KEYS = ['timestamp', 'time', 'ts', 'date'];
const LEVEL_KEYS = ['level', 'severity'];

function levelColor(val: string): string {
  const v = val.toLowerCase();
  if (v === 'error' || v === 'fatal') return 'text-red-400';
  if (v === 'warn' || v === 'warning') return 'text-yellow-400';
  if (v === 'info') return 'text-[var(--los-accent)]';
  return 'text-[var(--los-muted)]';
}

export interface LogViewProps {
  entries: Record<string, unknown>[];
}

export const LogView = ({ entries }: LogViewProps) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<Record<string, unknown> | null>(null);

  const columns = useMemo(() => {
    const keySet = new Set<string>();
    for (const e of entries) {
      for (const k of Object.keys(e)) keySet.add(k);
    }
    const tsKey = TIMESTAMP_KEYS.find((k) => keySet.has(k));
    const lvlKey = LEVEL_KEYS.find((k) => keySet.has(k));
    const rest = [...keySet].filter((k) => k !== tsKey && k !== lvlKey).sort();
    return [tsKey, lvlKey, ...rest].filter((k): k is string => k !== undefined);
  }, [entries]);

  const reversed = useMemo(() => [...entries].reverse(), [entries]);

  const filtered = useMemo(() => {
    if (!search.trim()) return reversed;
    const q = search.toLowerCase();
    return reversed.filter((row) =>
      Object.values(row).some((v) =>
        String(v ?? '')
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [reversed, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const lvlKey = LEVEL_KEYS.find((k) => columns.includes(k));

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-[var(--los-bg)]">
      <div className="flex items-center gap-3 p-2 border-b border-[var(--los-border)]">
        <input
          type="text"
          placeholder="Search logs..."
          className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1 text-xs font-mono text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)] placeholder:text-[var(--los-muted)]"
          value={search}
          // biome-ignore lint/a11y/noAutofocus: log search is the primary action in LOG mode
          autoFocus
          onInput={(e) => {
            setSearch(e.currentTarget.value);
            setPage(0);
          }}
        />
        <MonoLabel className="text-xs shrink-0">{filtered.length} entries</MonoLabel>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[var(--los-bg)] z-10">
            <tr>
              {columns.map((col) => (
                <th key={col} className="p-2 border-b border-[var(--los-border)] whitespace-nowrap">
                  <MonoLabel className="text-xs font-bold uppercase">{col}</MonoLabel>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => {
              const hasComplex = Object.values(row).some(isComplex);
              const isExpanded = expandedRow === row;
              return (
                <>
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: page-relative index is stable within this render
                    key={i}
                    onClick={() => hasComplex && setExpandedRow(isExpanded ? null : row)}
                    className={cn(
                      'border-b border-[var(--los-border)]/50 transition-colors last:border-0',
                      hasComplex
                        ? 'cursor-pointer hover:bg-[var(--los-accent)]/5'
                        : 'hover:bg-[var(--los-border)]/10',
                      isExpanded && 'bg-[var(--los-accent)]/5',
                    )}
                  >
                    {columns.map((col) => {
                      const raw = row[col];
                      const val = cellDisplay(raw);
                      const isLevel = col === lvlKey;
                      return (
                        <td
                          key={col}
                          className="p-2 max-w-[300px]"
                          title={isComplex(raw) ? JSON.stringify(raw) : val}
                        >
                          {isLevel ? (
                            <span className={cn('text-xs font-mono font-bold', levelColor(val))}>
                              {val.toUpperCase()}
                            </span>
                          ) : (
                            <MonoText
                              className={cn(
                                'text-xs truncate block',
                                isComplex(raw) && 'text-[var(--los-accent)]',
                              )}
                            >
                              {val}
                            </MonoText>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {isExpanded && (
                    <tr key={`${i}-expanded`}>
                      <td colSpan={columns.length} className="p-0">
                        <div className="p-3 border-b border-[var(--los-border)] bg-[var(--los-bg)]">
                          <div className="flex flex-col gap-2">
                            {Object.entries(row).map(([key, val]) => {
                              if (!isComplex(val)) return null;
                              return (
                                <div key={key}>
                                  <MonoLabel className="text-[10px] uppercase text-[var(--los-muted)] mb-1 block">
                                    {key}
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
            {paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center">
                  <MonoText className="text-[var(--los-muted)]">No entries match</MonoText>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--los-border)] shrink-0">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {safePage + 1} / {totalPages} ({filtered.length} entries)
          </MonoText>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
