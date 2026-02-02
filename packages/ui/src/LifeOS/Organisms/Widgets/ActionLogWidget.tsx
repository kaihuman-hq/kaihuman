import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { ActionLogAddForm } from './ActionLogAddForm';
import { parseActionLog, serializeActionLog, appendAction } from './ActionLogLogic';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { cn } from '../../../utils';

export interface ActionLogWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ADD'; // Added ADD to align with MainApp prop spreading
  onChange?: (newContent: string) => void;
}

export const ActionLogWidget = ({ content, mode, onChange }: ActionLogWidgetProps) => {
  const data = useMemo(() => parseActionLog(content), [content]);

  // When parsing new items are appended, so look at the END of the list for latest items?
  // Usually logs are appended.
  // Requirement says: "show the last 5 items" -> newest items.
  // If file order is chrono asc (oldest -> newest), we take array end.
  const reversedEntries = useMemo(() => [...data.entries].reverse(), [data.entries]);
  const lastEntries = reversedEntries.slice(0, 5);
  const totalCount = data.entries.length;

  // Last item timestamp
  const lastItem = data.entries[data.entries.length - 1]; // Last in file = Newest

  // Format relative time helper
  const getRelativeTime = (isoString?: string) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const handleAdd = (desc: string, tags: string[]) => {
    const newData = appendAction(data, desc, tags);
    onChange?.(serializeActionLog(newData));
  };

  if (mode === 'ADD') {
    return (
      <div className="h-full w-full p-4 overflow-y-auto">
        <ActionLogAddForm onAdd={handleAdd} />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-4 relative">
      {/* Header - Reuse existing style if possible or custom */}
      {mode === 'SMALL' && (
        <div className="flex justify-between items-end mb-4 shrink-0">
          <MonoHeader className="text-sm">ACTION LOG</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {totalCount} ITEMS
          </MonoText>
        </div>
      )}

      {/* Helper stats row for Small View */}
      {mode === 'SMALL' && (
        <div className="flex justify-between items-center mb-2 pb-2 border-b border-[var(--los-border)]">
          <MonoText className="text-[10px] text-[var(--los-muted)]">LAST ENTRY</MonoText>
          <MonoText className="text-[10px] text-[var(--los-accent)]">{getRelativeTime(lastItem?.timestamp)}</MonoText>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        <div className="flex flex-col gap-3">
          {lastEntries.map((entry, idx) => (
            <div key={idx} className="flex flex-col gap-1 border-b border-[var(--los-border)] pb-2 last:border-0">
              <div className="flex justify-between items-start gap-2">
                <MonoText className="text-[10px] text-[var(--los-muted)] shrink-0 whitespace-nowrap">
                  {entry.timestamp.split(' ')[1]?.slice(0, 5) || entry.timestamp}
                </MonoText>
                {/* If in focus mode, maybe show date too? Small view just time is enough if recent */}
                {mode === 'FOCUS' && (
                  <MonoText className="text-[10px] text-[var(--los-muted)] shrink-0 hidden md:block">
                    {entry.timestamp.split(' ')[0]}
                  </MonoText>
                )}
              </div>
              <MonoText className="text-xs leading-tight">
                {/* Highlight tags manually or just render text */}
                {entry.description}
              </MonoText>
            </div>
          ))}
          {lastEntries.length === 0 && (
            <div className="text-[var(--los-muted)] text-[10px] text-center mt-4">No actions logged yet.</div>
          )}
        </div>
      </div>

      {/* Footer for Focus Mode */}
      {mode === 'FOCUS' && (
        <div className="mt-4 pt-4 border-t border-[var(--los-border)] flex justify-between">
          <MonoText className="text-[10px] text-[var(--los-muted)]">Total: {totalCount}</MonoText>
          {lastItem && <MonoText className="text-[10px] text-[var(--los-muted)]">Latest: {lastItem.timestamp}</MonoText>}
        </div>
      )}
    </div>
  );
};
