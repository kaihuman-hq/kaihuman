import { h, Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { DataCollectionData, parseDataCollection, serializeDataCollection } from './DataCollectionLogic';
import { DataCollectionChart } from './DataCollectionChart';
import { DataCollectionAddForm } from './DataCollectionAddForm';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';

export interface DataCollectionWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS';
  onChange?: (newContent: string) => void;
  className?: string;
  // In Focus mode, we might receive a viewMode from parent via context or props if we lifted state up?
  // But based on `FocusedTile` in `MainApp.tsx`, the view mode button is in the header, 
  // and it seems `FocusedTile` manages `viewMode`.
  // However, `FocusedTile` passes `viewMode` naturally? 
  // Wait, `FocusedTile` passes `activeTile` to renderer.
  // In `MainApp.tsx`, `renderTileContent` is called.
  // `FocusedTile` has its own local state `viewMode`. 
  // Checks `viewMode` to decide what to render.
  // If `viewMode` is `WIDGET`, it renders `DataCollectionWidget` with mode='FOCUS'.
  // If `viewMode` is `ADD`, we need to know that?
  // Actually `FocusedTile` renders `DataCollectionWidget` ONLY when `viewMode === 'WIDGET'`.
  // For `ADD` view, `FocusedTile` logic needs to be updated to render the widget in a specific "Add Mode" 
  // OR `DataCollectionWidget` handles both and `FocusedTile` passes a prop.
  // Looking at `FocusedTile` in `MainApp.tsx` (Step 25):
  // It renders `TimeTrackingWidget` for `WIDGET` mode.
  // It renders `EventAddForm` for `ADD` mode.
  // So I should expose `DataCollectionAddForm` separately in `MainApp` or `DataCollectionWidget` should export it.
  // I'll export `DataCollectionAddForm` from its file and use it in `MainApp`.
}

import { filterDataByTime, TimeFilterMode } from './DataCollectionLogic';

export const DataCollectionWidget = ({ content, mode, onChange, className }: DataCollectionWidgetProps) => {
  const data = useMemo(() => parseDataCollection(content), [content]);
  const [filterMode, setFilterMode] = useState<TimeFilterMode>('ALL');

  const filteredRows = useMemo(() => {
    if (mode === 'SMALL') return data.rows;
    return filterDataByTime(data, filterMode);
  }, [data, filterMode, mode]);

  const filteredData = useMemo(() => ({
    ...data,
    rows: filteredRows
  }), [data, filteredRows]);

  // If invalid or empty
  if (!data.columns.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full text-[var(--los-muted)] p-4 text-center", className)}>
        <MonoText>Invalid Data Structure</MonoText>
        <MonoText className="text-xs mt-2">No columns defined.</MonoText>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      {/* FILTER SWITCHER (FOCUS MODE ONLY) */}
      {mode === 'FOCUS' && (
        <div className="flex items-center justify-end px-4 py-2 gap-2 border-b border-[var(--los-border)] overflow-x-auto scrollbar-hide">
          <FilterButton label="ALL YEARS" active={filterMode === 'ALL'} onClick={() => setFilterMode('ALL')} />
          <FilterButton label="YTD" active={filterMode === 'YTD'} onClick={() => setFilterMode('YTD')} />
          <FilterButton label="LAST YEAR" active={filterMode === 'LAST_YEAR'} onClick={() => setFilterMode('LAST_YEAR')} />
          <FilterButton label="LAST 6M" active={filterMode === 'LAST_6_MONTHS'} onClick={() => setFilterMode('LAST_6_MONTHS')} />
          <FilterButton label="LAST 12M" active={filterMode === 'LAST_12_MONTHS'} onClick={() => setFilterMode('LAST_12_MONTHS')} />
        </div>
      )}

      {/* Internal Header only for Small mode */}
      {mode === 'SMALL' && (
        <div className="flex justify-between items-center mb-2 px-1 pt-1 shrink-0">
          <MonoHeader className="text-sm">DATA</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {data.rows.length} ROWS
          </MonoText>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <DataCollectionChart data={filteredData} hideLegend={mode === 'SMALL'} />
      </div>

      {/* Footer Stats for Focus Mode? */}
      {mode === 'FOCUS' && (
        <div className="h-12 border-t border-[var(--los-border)] flex items-center justify-between px-4 shrink-0">
          <MonoText className="text-xs text-[var(--los-muted)]">
            Entries: <span className="text-[var(--los-fg)]">{filteredRows.length}</span> / <span className="text-[var(--los-muted)]">{data.rows.length}</span>
          </MonoText>
        </div>
      )}
    </div>
  );
};

const FilterButton = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-2 py-1 text-[10px] font-mono rounded-sm transition-colors border",
      active
        ? "bg-[var(--los-fg)] text-[var(--los-bg)] border-[var(--los-fg)]"
        : "bg-transparent text-[var(--los-muted)] border-transparent hover:text-[var(--los-fg)] hover:border-[var(--los-border)]"
    )}
  >
    {label}
  </button>
);
