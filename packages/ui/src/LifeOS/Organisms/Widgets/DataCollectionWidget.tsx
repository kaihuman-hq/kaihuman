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

export const DataCollectionWidget = ({ content, mode, onChange, className }: DataCollectionWidgetProps) => {
  const data = useMemo(() => parseDataCollection(content), [content]);

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
      {/* Internal Header only for Small mode, Focus mode has tile header */}
      {mode === 'SMALL' && (
        <div className="flex justify-between items-center mb-2 px-1 pt-1 shrink-0">
          <MonoHeader className="text-sm">DATA</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {data.rows.length} ROWS
          </MonoText>
        </div>
      )}

      {/* Chart Area */}
      <div className="flex-1 min-h-0 relative">
        <DataCollectionChart data={data} />
      </div>

      {/* Footer Stats for Focus Mode? */}
      {mode === 'FOCUS' && (
        <div className="h-12 border-t border-[var(--los-border)] flex items-center justify-between px-4 shrink-0">
          <MonoText className="text-xs text-[var(--los-muted)]">
            Total Entries: <span className="text-[var(--los-fg)]">{data.rows.length}</span>
          </MonoText>
          <div className="flex gap-4">
            {/* Aggregations could go here */}
          </div>
        </div>
      )}
    </div>
  );
};
