import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import {
  addColumn,
  addConsumptionEntry,
  type CompareMode,
  type ConsumptionData,
  compareYearData,
  getMonthlyStats,
  getYearlyStats,
  MONTH_NAMES,
  type MonthlyStats,
  monthPctChange,
  parseConsumption,
  removeColumn,
  sameDayLastYear,
  serializeConsumption,
  toggleCompareYear,
  type YearlyStats,
} from './ConsumptionLogic';

const YEAR_COLORS = [
  '#60a5fa',
  '#4ade80',
  '#f59e0b',
  '#f87171',
  '#a78bfa',
  '#34d399',
  '#fb923c',
  '#e879f9',
];

function formatNum(n: number): string {
  if (n === undefined || Number.isNaN(n) || !Number.isFinite(n)) return '–';
  if (Math.abs(n - Math.round(n)) < 0.01) return Math.round(n).toLocaleString();
  return n.toFixed(2);
}

export interface ConsumptionWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  onChange?: (newContent: string) => void;
  onOpenAdd?: () => void;
  initialTab?: FocusTab;
}

type FocusTab = 'RECENT' | 'MONTHLY' | 'YEARLY' | 'COMPARE' | 'COLUMNS' | 'ADD';

export const ConsumptionWidget = ({
  content,
  mode,
  onChange,
  onOpenAdd,
  initialTab,
}: ConsumptionWidgetProps) => {
  const { data, modified } = useMemo(() => parseConsumption(content), [content]);

  // Write back gap-filled data once per unique content change
  const pendingSaveRef = useRef<string | null>(null);
  useEffect(() => {
    if (modified && onChange && pendingSaveRef.current !== content) {
      pendingSaveRef.current = content;
      onChange(serializeConsumption(data));
    }
  }, [content, modified, data, onChange]);

  const handleDataChange = useCallback(
    (newData: ConsumptionData) => {
      onChange?.(serializeConsumption(newData));
    },
    [onChange],
  );

  if (mode !== 'FOCUS') {
    if (data.columns.length === 0) {
      return (
        <div className="p-4 text-[var(--los-muted)] font-mono text-xs">
          Open in focus mode to configure columns
        </div>
      );
    }
    return <SmallWidget data={data} onDataChange={handleDataChange} onOpenAdd={onOpenAdd} />;
  }

  return <FocusView data={data} onDataChange={handleDataChange} initialTab={initialTab} />;
};

// --- Recent entries table ---

const RecentTable = ({ data, compact }: { data: ConsumptionData; compact?: boolean }) => {
  const recent = data.entries.slice(-30).reverse();
  const byDate = useMemo(() => new Map(data.entries.map((e) => [e.date, e])), [data.entries]);

  if (recent.length === 0) {
    return <div className="p-4 text-[var(--los-muted)] font-mono text-xs">No entries yet</div>;
  }

  return (
    <div className="w-full h-full overflow-auto custom-scrollbar p-2">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-[var(--los-border)]">
            <th className="text-left py-1 px-2 text-[var(--los-muted)]">Date</th>
            {data.columns.map((col) => (
              <th key={col.key} className="text-right py-1 px-2 text-[var(--los-muted)]">
                {compact ? col.title.slice(0, 8) : col.title}
                {col.unit ? ` (${col.unit})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recent.map((entry) => (
            <tr
              key={entry.date}
              className={cn(
                'border-b border-[var(--los-border)]',
                entry.interpolated ? 'opacity-40 italic' : '',
              )}
            >
              <td className="py-1 px-2 text-[var(--los-muted)]">
                {compact ? entry.date.slice(5) : entry.date}
              </td>
              {data.columns.map((col) => {
                const delta = entry.deltas[col.key];
                const lastYear = byDate.get(sameDayLastYear(entry.date))?.deltas[col.key];
                return (
                  <td key={col.key} className="py-1 px-2 text-right tabular-nums">
                    {delta !== undefined && !Number.isNaN(delta) && delta > 0
                      ? formatNum(delta)
                      : '–'}
                    {lastYear !== undefined && !Number.isNaN(lastYear) && lastYear > 0 && (
                      <span className="ml-1 text-[var(--los-muted)] opacity-70">
                        ({formatNum(lastYear)})
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// --- Small widget with quick-add ---

const SmallWidget = ({
  data,
  onDataChange,
  onOpenAdd,
}: {
  data: ConsumptionData;
  onDataChange: (newData: ConsumptionData) => void;
  onOpenAdd?: () => void;
}) => {
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const yearlyTotals = useMemo(() => {
    const stats = getYearlyStats(data);
    return stats.find((s) => s.year === currentYear)?.totalByKey ?? {};
  }, [data, currentYear]);

  const lastReadings = useMemo(() => {
    const result: Record<string, number> = {};
    const sorted = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
    for (const entry of sorted) {
      for (const col of data.columns) {
        const val = entry.readings[col.key];
        if (val !== undefined && !Number.isNaN(val)) {
          result[col.key] = val;
        }
      }
    }
    return result;
  }, [data]);

  const handleSubmit = () => {
    if (!date) {
      setError('Date required');
      return;
    }
    if (data.entries.some((e) => e.date === date)) {
      setError('Entry already exists');
      return;
    }
    const parsedReadings: Record<string, number> = {};
    for (const col of data.columns) {
      const val = readings[col.key];
      parsedReadings[col.key] = val ? Number(val) : NaN;
    }
    setError(null);
    onDataChange(addConsumptionEntry(data, date, parsedReadings));
    setReadings({});
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="p-3 space-y-2 overflow-auto h-full custom-scrollbar">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-mono text-[var(--los-muted)] uppercase tracking-wider">
            New Entry
          </span>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            className="text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors font-mono text-xs leading-none"
          >
            ✕
          </button>
        </div>
        <div>
          <div className="text-[9px] font-mono text-[var(--los-muted)] mb-0.5">DATE</div>
          <input
            type="date"
            value={date}
            onInput={(e) => setDate(e.currentTarget.value)}
            className="bg-transparent border-b border-[var(--los-border)] py-0.5 text-xs font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)] w-full"
          />
        </div>
        {data.columns.map((col) => {
          const last = lastReadings[col.key];
          return (
            <div key={col.key}>
              <div className="text-[9px] font-mono text-[var(--los-muted)] mb-0.5">
                {col.title.toUpperCase()}
                {col.unit ? ` (${col.unit})` : ''}
                {last !== undefined ? (
                  <span className="ml-1 opacity-50">last: {formatNum(last)}</span>
                ) : null}
              </div>
              <input
                type="number"
                value={readings[col.key] ?? ''}
                onInput={(e) =>
                  setReadings((prev) => ({ ...prev, [col.key]: e.currentTarget.value }))
                }
                placeholder={last !== undefined ? String(Math.round(last)) : '0'}
                className="w-full bg-transparent border-b border-[var(--los-border)] py-0.5 text-xs font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)]"
              />
            </div>
          );
        })}
        {error && <div className="text-red-400 text-[9px] font-mono">{error}</div>}
        <button
          type="button"
          onClick={handleSubmit}
          className="px-3 py-1 bg-[var(--los-accent-dim)] text-[var(--los-accent)] text-[9px] font-mono hover:opacity-80 transition-opacity"
        >
          ADD
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-stretch h-full w-full">
      {/* Yearly totals */}
      <div className="flex-1 flex flex-col justify-center gap-2 p-3 min-w-0">
        <div className="text-[9px] font-mono text-[var(--los-muted)] uppercase tracking-wider">
          {currentYear}
        </div>
        {data.columns.map((col) => {
          const total = yearlyTotals[col.key];
          return (
            <div key={col.key} className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[10px] font-mono text-[var(--los-muted)] truncate shrink-0">
                {col.title}
              </span>
              <span className="text-sm font-mono font-bold text-[var(--los-fg)] tabular-nums">
                {total !== undefined && !Number.isNaN(total) ? formatNum(total) : '–'}
              </span>
              {col.unit && (
                <span className="text-[9px] font-mono text-[var(--los-muted)]">{col.unit}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Add button */}
      <button
        type="button"
        onClick={() => (onOpenAdd ? onOpenAdd() : setAdding(true))}
        className="flex items-center justify-center w-10 shrink-0 border-l border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] transition-colors font-mono text-lg leading-none"
        title="Add entry"
      >
        +
      </button>
    </div>
  );
};

// --- Focus mode with tabs ---

const FocusView = ({
  data,
  onDataChange,
  initialTab,
}: {
  data: ConsumptionData;
  onDataChange: (newData: ConsumptionData) => void;
  initialTab?: FocusTab;
}) => {
  const [tab, setTab] = useState<FocusTab>(() => {
    if (initialTab) return initialTab;
    if (data.columns.length === 0) return 'COLUMNS';
    if (data.entries.length === 0) return 'ADD';
    return 'RECENT';
  });
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const monthlyStats = useMemo(() => getMonthlyStats(data), [data]);
  const yearlyStats = useMemo(() => getYearlyStats(data), [data]);
  const years = useMemo(() => yearlyStats.map((s) => s.year), [yearlyStats]);

  const activeMetricKey = selectedMetricKey ?? data.columns[0]?.key ?? '';
  const activeYear = selectedYear ?? years[years.length - 1] ?? new Date().getFullYear();

  const TABS: { id: FocusTab; label: string }[] = [
    { id: 'RECENT', label: 'RECENT' },
    { id: 'MONTHLY', label: 'MONTHLY' },
    { id: 'YEARLY', label: 'YEARLY' },
    { id: 'COMPARE', label: 'COMPARE' },
    { id: 'ADD', label: 'ADD' },
    { id: 'COLUMNS', label: 'COLUMNS' },
  ];

  const showMetricSelector = (tab === 'MONTHLY' || tab === 'COMPARE') && data.columns.length > 1;
  const showYearSelector = tab === 'MONTHLY' && years.length > 0;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-1 px-4 pt-4 pb-2 border-b border-[var(--los-border)] flex-shrink-0">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm',
              tab === id
                ? 'bg-[var(--los-accent-dim)] text-[var(--los-accent)]'
                : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
            )}
          >
            {label}
          </button>
        ))}

        {showMetricSelector &&
          data.columns.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => setSelectedMetricKey(col.key)}
              className={cn(
                'px-2 py-0.5 text-[10px] font-mono rounded-full border transition-colors',
                activeMetricKey === col.key
                  ? 'bg-[var(--los-accent-dim)] text-[var(--los-accent)] border-[var(--los-accent)]'
                  : 'text-[var(--los-muted)] border-[var(--los-border)] hover:text-[var(--los-fg)]',
              )}
            >
              {col.title}
            </button>
          ))}

        {showYearSelector && (
          <select
            value={activeYear}
            onChange={(e) => setSelectedYear(Number((e.target as HTMLSelectElement).value))}
            className="text-[10px] font-mono bg-[var(--los-bg)] text-[var(--los-fg)] border border-[var(--los-border)] rounded-sm px-2 py-1"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {tab === 'RECENT' && <RecentTable data={data} />}
        {tab === 'MONTHLY' && (
          <MonthlyView
            data={data}
            monthlyStats={monthlyStats}
            year={activeYear}
            metricKey={activeMetricKey}
          />
        )}
        {tab === 'YEARLY' && <YearlyView data={data} yearlyStats={yearlyStats} />}
        {tab === 'COMPARE' && (
          <CompareView
            data={data}
            monthlyStats={monthlyStats}
            years={years}
            metricKey={activeMetricKey}
          />
        )}
        {tab === 'ADD' && <AddEntryTab data={data} onDataChange={onDataChange} />}
        {tab === 'COLUMNS' && <ColumnsTab data={data} onDataChange={onDataChange} />}
      </div>
    </div>
  );
};

// --- Columns management ---

const ColumnsTab = ({
  data,
  onDataChange,
}: {
  data: ConsumptionData;
  onDataChange: (newData: ConsumptionData) => void;
}) => {
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [yearlyTarget, setYearlyTarget] = useState('');
  const [higherIsBetter, setHigherIsBetter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setError('Column key is required');
      return;
    }
    if (data.columns.some((c) => c.key === trimmedKey)) {
      setError('Column key already exists');
      return;
    }
    setError(null);
    onDataChange(
      addColumn(data, {
        key: trimmedKey,
        title: title.trim() || trimmedKey,
        unit: unit.trim(),
        yearlyTarget: yearlyTarget ? Number(yearlyTarget) : 0,
        higherIsBetter,
      }),
    );
    setKey('');
    setTitle('');
    setUnit('');
    setYearlyTarget('');
    setHigherIsBetter(false);
  };

  return (
    <div className="p-4 space-y-6">
      {data.columns.length > 0 && (
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-[var(--los-border)]">
              <th className="text-left py-1.5 px-2 text-[var(--los-muted)]">Key</th>
              <th className="text-left py-1.5 px-2 text-[var(--los-muted)]">Title</th>
              <th className="text-left py-1.5 px-2 text-[var(--los-muted)]">Unit</th>
              <th className="text-right py-1.5 px-2 text-[var(--los-muted)]">Yearly Target</th>
              <th className="text-center py-1.5 px-2 text-[var(--los-muted)]">↑ Better</th>
              <th className="py-1.5 px-2" />
            </tr>
          </thead>
          <tbody>
            {data.columns.map((col) => (
              <tr key={col.key} className="border-b border-[var(--los-border)]">
                <td className="py-1.5 px-2 text-[var(--los-muted)]">{col.key}</td>
                <td className="py-1.5 px-2">{col.title}</td>
                <td className="py-1.5 px-2">{col.unit || '–'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {col.yearlyTarget > 0 ? col.yearlyTarget : '–'}
                </td>
                <td className="py-1.5 px-2 text-center text-[var(--los-muted)]">
                  {col.higherIsBetter ? '✓' : '–'}
                </td>
                <td className="py-1.5 px-2 text-right">
                  <button
                    type="button"
                    onClick={() => onDataChange(removeColumn(data, col.key))}
                    className="text-[var(--los-muted)] hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="space-y-3 border border-[var(--los-border)] p-4">
        <div className="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-wider">
          Add Column
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-mono text-[var(--los-muted)] mb-1">KEY *</div>
            <input
              type="text"
              value={key}
              onInput={(e) => setKey(e.currentTarget.value)}
              placeholder="e.g. Strom"
              className="w-full bg-transparent border-b border-[var(--los-border)] py-1 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)]"
            />
          </div>
          <div>
            <div className="text-[10px] font-mono text-[var(--los-muted)] mb-1">DISPLAY TITLE</div>
            <input
              type="text"
              value={title}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder="e.g. Electricity"
              className="w-full bg-transparent border-b border-[var(--los-border)] py-1 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)]"
            />
          </div>
          <div>
            <div className="text-[10px] font-mono text-[var(--los-muted)] mb-1">UNIT</div>
            <input
              type="text"
              value={unit}
              onInput={(e) => setUnit(e.currentTarget.value)}
              placeholder="e.g. kWh"
              className="w-full bg-transparent border-b border-[var(--los-border)] py-1 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)]"
            />
          </div>
          <div>
            <div className="text-[10px] font-mono text-[var(--los-muted)] mb-1">YEARLY TARGET</div>
            <input
              type="number"
              value={yearlyTarget}
              onInput={(e) => setYearlyTarget(e.currentTarget.value)}
              placeholder="e.g. 3500"
              className="w-full bg-transparent border-b border-[var(--los-border)] py-1 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)]"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={higherIsBetter}
            onChange={(e) => setHigherIsBetter(e.currentTarget.checked)}
            className="accent-[var(--los-accent)] cursor-pointer"
          />
          <span className="text-[10px] font-mono text-[var(--los-muted)]">
            Higher is better (e.g. solar production)
          </span>
        </label>
        {error && <div className="text-red-400 text-[10px] font-mono">{error}</div>}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!key.trim()}
          className="px-4 py-1.5 bg-[var(--los-accent-dim)] text-[var(--los-accent)] text-[10px] font-mono hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          ADD COLUMN
        </button>
      </div>
    </div>
  );
};

// --- Add entry form ---

const AddEntryTab = ({
  data,
  onDataChange,
}: {
  data: ConsumptionData;
  onDataChange: (newData: ConsumptionData) => void;
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const lastReadings = useMemo(() => {
    const result: Record<string, number> = {};
    const sorted = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
    for (const entry of sorted) {
      for (const col of data.columns) {
        const val = entry.readings[col.key];
        if (val !== undefined && !Number.isNaN(val)) {
          result[col.key] = val;
        }
      }
    }
    return result;
  }, [data]);

  if (data.columns.length === 0) {
    return (
      <div className="p-4 text-[var(--los-muted)] font-mono text-xs">
        Add columns first before adding entries.
      </div>
    );
  }

  const handleSubmit = () => {
    if (!date) {
      setError('Date is required');
      return;
    }
    if (data.entries.some((e) => e.date === date)) {
      setError('An entry for this date already exists');
      return;
    }
    const parsedReadings: Record<string, number> = {};
    for (const col of data.columns) {
      const val = readings[col.key];
      parsedReadings[col.key] = val ? Number(val) : NaN;
    }
    setError(null);
    onDataChange(addConsumptionEntry(data, date, parsedReadings));
    setReadings({});
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <div className="text-[10px] font-mono text-[var(--los-muted)]">DATE *</div>
        <input
          type="date"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
          className="bg-transparent border-b border-[var(--los-border)] py-1 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.columns.map((col) => {
          const last = lastReadings[col.key];
          return (
            <div key={col.key}>
              <div className="text-[10px] font-mono text-[var(--los-muted)] mb-1">
                {col.title.toUpperCase()}
                {col.unit ? ` (${col.unit})` : ''}
                {last !== undefined ? (
                  <span className="ml-1 opacity-50">last: {formatNum(last)}</span>
                ) : null}
              </div>
              <input
                type="number"
                value={readings[col.key] ?? ''}
                onInput={(e) =>
                  setReadings((prev) => ({ ...prev, [col.key]: e.currentTarget.value }))
                }
                placeholder={last !== undefined ? String(Math.round(last)) : '0'}
                className="w-full bg-transparent border-b border-[var(--los-border)] py-1 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] text-[var(--los-fg)]"
              />
            </div>
          );
        })}
      </div>
      {error && <div className="text-red-400 text-[10px] font-mono">{error}</div>}
      <button
        type="button"
        onClick={handleSubmit}
        className="px-4 py-1.5 bg-[var(--los-accent-dim)] text-[var(--los-accent)] text-[10px] font-mono hover:opacity-80 transition-opacity"
      >
        ADD ENTRY
      </button>
    </div>
  );
};

// --- Monthly breakdown ---

const MonthlyView = ({
  data,
  monthlyStats,
  year,
  metricKey,
}: {
  data: ConsumptionData;
  monthlyStats: MonthlyStats[];
  year: number;
  metricKey: string;
}) => {
  const col = data.columns.find((c) => c.key === metricKey);
  const yearStats = monthlyStats.filter((s) => s.year === year);

  const getPctChange = (month: number): number | null =>
    monthPctChange(monthlyStats, year, month, metricKey);

  return (
    <div className="p-4 overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-[var(--los-border)]">
            <th className="text-left py-1.5 px-2 text-[var(--los-muted)]">Month</th>
            <th className="text-right py-1.5 px-2 text-[var(--los-muted)]">
              Total{col?.unit ? ` (${col.unit})` : ''}
            </th>
            <th className="text-right py-1.5 px-2 text-[var(--los-muted)]">Avg / day</th>
            <th className="text-right py-1.5 px-2 text-[var(--los-muted)]">vs {year - 1}</th>
            <th className="text-right py-1.5 px-2 text-[var(--los-muted)]">Days</th>
          </tr>
        </thead>
        <tbody>
          {MONTH_NAMES.map((name, i) => {
            const month = i + 1;
            const stats = yearStats.find((s) => s.month === month);
            const change = getPctChange(month);
            return (
              <tr
                key={month}
                className="border-b border-[var(--los-border)] hover:bg-[var(--los-bg-hover,rgba(255,255,255,0.03))]"
              >
                <td className="py-1.5 px-2">{name}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {stats ? formatNum(stats.totalByKey[metricKey] ?? 0) : '–'}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {stats ? formatNum(stats.avgPerDayByKey[metricKey] ?? 0) : '–'}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {change !== null
                    ? (() => {
                        const isGood = col?.higherIsBetter ? change > 0 : change < 0;
                        return (
                          <span className={isGood ? 'text-green-400' : 'text-red-400'}>
                            {change > 0 ? '+' : ''}
                            {change.toFixed(1)}%
                          </span>
                        );
                      })()
                    : '–'}
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--los-muted)]">
                  {stats?.daysCount ?? '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- Yearly totals ---

const YearlyView = ({
  data,
  yearlyStats,
}: {
  data: ConsumptionData;
  yearlyStats: YearlyStats[];
}) => (
  <div className="p-4 overflow-x-auto">
    <table className="w-full text-xs font-mono border-collapse">
      <thead>
        <tr className="border-b border-[var(--los-border)]">
          <th className="text-left py-1.5 px-2 text-[var(--los-muted)]">Year</th>
          {data.columns.map((col) => (
            <th key={col.key} className="text-right py-1.5 px-2 text-[var(--los-muted)]">
              {col.title}
              {col.unit ? ` (${col.unit})` : ''}
            </th>
          ))}
          <th className="text-right py-1.5 px-2 text-[var(--los-muted)]">Days</th>
        </tr>
      </thead>
      <tbody>
        {yearlyStats.map((stats, idx) => {
          const prev = yearlyStats[idx - 1];
          return (
            <tr key={stats.year} className="border-b border-[var(--los-border)]">
              <td className="py-1.5 px-2 font-bold text-[var(--los-fg)]">{stats.year}</td>
              {data.columns.map((col) => {
                const total = stats.totalByKey[col.key] ?? 0;
                const prevTotal = prev?.totalByKey[col.key];
                const pct =
                  col.yearlyTarget > 0 ? ((total / col.yearlyTarget) * 100).toFixed(0) : null;
                const trend =
                  prevTotal !== undefined && prevTotal > 0 ? (total > prevTotal ? '▲' : '▼') : null;
                const isUp = trend === '▲';
                const trendColor = trend
                  ? col.higherIsBetter
                    ? isUp
                      ? 'text-green-400'
                      : 'text-red-400'
                    : isUp
                      ? 'text-red-400'
                      : 'text-green-400'
                  : '';
                return (
                  <td key={col.key} className="py-1.5 px-2 text-right tabular-nums">
                    {formatNum(total)}
                    {pct !== null && <span className="ml-1 text-[var(--los-muted)]">({pct}%)</span>}
                    {trend && <span className={cn('ml-1 text-[10px]', trendColor)}>{trend}</span>}
                  </td>
                );
              })}
              <td className="py-1.5 px-2 text-right text-[var(--los-muted)]">{stats.daysCount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// --- Multi-year monthly comparison chart ---

type ChartMode = CompareMode;

const CompareView = ({
  data,
  monthlyStats,
  years,
  metricKey,
}: {
  data: ConsumptionData;
  monthlyStats: MonthlyStats[];
  years: number[];
  metricKey: string;
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [activeYears, setActiveYears] = useState<Set<number>>(() => new Set(years));
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');

  useEffect(() => {
    if (!chartRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setDimensions({ width: rect.width, height: rect.height });
    });
    obs.observe(chartRef.current);
    return () => obs.disconnect();
  }, []);

  const toggleYear = (year: number) =>
    setActiveYears((prev) => toggleCompareYear(prev, years, year));

  const col = data.columns.find((c) => c.key === metricKey);

  // Per year: 12 values based on mode
  const yearData = useMemo(
    () => compareYearData(monthlyStats, years, metricKey, chartMode),
    [years, monthlyStats, metricKey, chartMode],
  );

  // Only use active years for scale
  const activeIndices = years.map((y, i) => (activeYears.has(y) ? i : -1)).filter((i) => i >= 0);
  const allValues = activeIndices
    .flatMap((i) => yearData[i] ?? [])
    .filter((v): v is number => v !== null);
  const maxVal = allValues.length > 0 ? Math.max(...allValues) * 1.1 : 1;

  const { width, height } = dimensions;
  const PAD = { top: 20, right: 60, bottom: 30, left: 55 };
  const cw = Math.max(width - PAD.left - PAD.right, 1);
  const ch = Math.max(height - PAD.top - PAD.bottom, 1);

  const getX = (mi: number) => PAD.left + (mi / 11) * cw;
  const getY = (val: number) => PAD.top + ch - (val / maxVal) * ch;

  const buildPath = (points: (number | null)[]) => {
    const parts: string[] = [];
    let gap = true;
    for (let i = 0; i < points.length; i++) {
      const val = points[i];
      if (val === null || val === undefined) {
        gap = true;
        continue;
      }
      parts.push(`${gap ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(val).toFixed(1)}`);
      gap = false;
    }
    return parts.join(' ');
  };

  const modeLabel =
    chartMode === 'avg'
      ? `Avg per day${col?.unit ? ` (${col.unit})` : ''} — per month`
      : `Cumulative total${col?.unit ? ` (${col.unit})` : ''} — running sum per year`;

  return (
    <div className="p-4">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        {/* Mode toggle */}
        <div className="flex gap-1">
          {(['avg', 'cumulative'] as ChartMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setChartMode(m)}
              className={cn(
                'px-2 py-1 text-[10px] font-mono rounded-sm transition-colors',
                chartMode === m
                  ? 'bg-[var(--los-accent-dim)] text-[var(--los-accent)]'
                  : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
              )}
            >
              {m === 'avg' ? 'Avg / day' : 'Cumulative'}
            </button>
          ))}
        </div>

        {/* Clickable year legend */}
        <div className="flex flex-wrap gap-2">
          {years.map((year, i) => {
            const active = activeYears.has(year);
            const color = YEAR_COLORS[i % YEAR_COLORS.length] ?? '#60a5fa';
            return (
              <button
                key={year}
                type="button"
                onClick={() => toggleYear(year)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-mono transition-opacity',
                  active ? 'opacity-100' : 'opacity-30',
                )}
              >
                <div style={{ width: 16, height: 2, background: color, flexShrink: 0 }} />
                <span style={{ color: active ? color : undefined }}>{year}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[10px] font-mono text-[var(--los-muted)] mb-2">{modeLabel}</div>

      <div ref={chartRef} className="w-full h-[400px]">
        {width > 0 && height > 0 && (
          <svg width={width} height={height} role="img" aria-label="Monthly comparison chart">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = PAD.top + t * ch;
              const val = maxVal * (1 - t);
              return (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    y1={y}
                    x2={width - PAD.right}
                    y2={y}
                    stroke="var(--los-border)"
                    strokeOpacity={0.4}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={PAD.left - 5}
                    y={y + 4}
                    textAnchor="end"
                    fill="var(--los-muted)"
                    className="font-mono text-[9px]"
                  >
                    {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* X axis month labels */}
            {MONTH_NAMES.map((name, i) => (
              <text
                key={name}
                x={getX(i)}
                y={height - 8}
                textAnchor="middle"
                fill="var(--los-muted)"
                className="font-mono text-[9px]"
              >
                {name}
              </text>
            ))}

            {/* Lines per active year */}
            {years.map((year, yi) => {
              if (!activeYears.has(year)) return null;
              const points = yearData[yi] ?? [];
              const color = YEAR_COLORS[yi % YEAR_COLORS.length] ?? '#60a5fa';
              const pathD = buildPath(points);
              const lastIdx = points.reduce<number>((acc, v, i) => (v !== null ? i : acc), -1);
              return (
                <g key={year}>
                  {pathD && <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} />}
                  {points.map((val, mi) =>
                    val !== null ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: month index is stable and unique
                      <circle key={mi} cx={getX(mi)} cy={getY(val)} r={3} fill={color} />
                    ) : null,
                  )}
                  {(() => {
                    const labelVal = lastIdx >= 0 ? points[lastIdx] : null;
                    if (labelVal === null || labelVal === undefined) return null;
                    return (
                      <text
                        x={getX(lastIdx) + 6}
                        y={getY(labelVal) + 4}
                        fill={color}
                        className="font-mono text-[9px]"
                      >
                        {year}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};
