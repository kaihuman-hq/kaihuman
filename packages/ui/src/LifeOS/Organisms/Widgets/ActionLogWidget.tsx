import { useMemo } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { ActionLogAddForm } from './ActionLogAddForm';
import { appendAction, parseActionLog, serializeActionLog } from './ActionLogLogic';
import { CompactWidgetLayout } from './CompactWidgetLayout';

export interface ActionLogWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ADD' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED'; // Added ADD to align with MainApp prop spreading
  onChange?: (newContent: string) => void;
}

export const ActionLogWidget = ({ content, mode, onChange }: ActionLogWidgetProps) => {
  const data = useMemo(() => parseActionLog(content), [content]);

  // Sort entries: Newest first (Descending)
  const sortedEntries = useMemo(() => {
    return [...data.entries].sort((a, b) => {
      // Comparison by string usually works for ISO YYYY-MM-DD HH:mm:ss
      // But let's be safe
      return b.timestamp.localeCompare(a.timestamp);
    });
  }, [data.entries]);

  // View limits: Small = 5, Focus = All
  const displayEntries = mode === 'SMALL' ? sortedEntries.slice(0, 10) : sortedEntries;

  const totalCount = data.entries.length;

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let lastWeek = 0;
    let lastMonth = 0;

    data.entries.forEach((e) => {
      const d = new Date(e.timestamp);
      if (d >= oneWeekAgo) lastWeek++;
      if (d >= oneMonthAgo) lastMonth++;
    });

    return { lastWeek, lastMonth };
  }, [data.entries]);

  const handleAdd = (desc: string, tags: string[]) => {
    const newData = appendAction(data, desc, tags);
    onChange?.(serializeActionLog(newData));
  };

  if (mode === 'ADD') {
    return (
      <div className="w-full min-h-full p-4">
        <ActionLogAddForm onAdd={handleAdd} />
      </div>
    );
  }

  if (mode === 'MOBILE_COLLAPSED') {
    // Count items from today
    const todayStr = new Date().toISOString().split('T')[0] || '';
    const todayCount = data.entries.filter((e) => e.timestamp?.startsWith(todayStr)).length;

    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
        <MonoHeader className="text-5xl font-bold text-[var(--los-fg)] mb-1">
          {todayCount}
        </MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
          ACTIONS TODAY
        </MonoText>
      </div>
    );
  }

  if (mode === 'MOBILE_EXPANDED') {
    const recentLogs = sortedEntries.slice(0, 3);
    return (
      <CompactWidgetLayout>
        <div className="shrink-0 mb-4">
          <MonoHeader className="text-xs text-[var(--los-muted)] mb-2">QUICK LOG</MonoHeader>
          {/* Inline simplified add form or just re-use ActionLogAddForm but styled? 
                       ActionLogAddForm currently takes full height. Let's wrap it in a container.
                   */}
          <div className="border border-[var(--los-border)] rounded-md overflow-hidden bg-[var(--los-bg)]">
            <ActionLogAddForm onAdd={handleAdd} />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--los-bg)] pointer-events-none z-10 opactiy-50" />
          <div className="flex flex-col gap-3 opacity-60">
            <MonoHeader className="text-[10px] text-[var(--los-muted)]">RECENT</MonoHeader>
            {recentLogs.map((entry) => (
              <div
                key={entry.timestamp}
                className="flex gap-2 text-sm border-l-2 border-[var(--los-border)] pl-3"
              >
                <span className="text-[var(--los-muted)] text-xs whitespace-nowrap">
                  {entry.timestamp.split(' ')[1]?.slice(0, 5)}
                </span>
                <span className="truncate">{entry.description}</span>
              </div>
            ))}
          </div>
        </div>
      </CompactWidgetLayout>
    );
  }

  return (
    <div
      className={cn(
        'w-full flex flex-col p-4 relative',
        mode === 'SMALL' ? 'h-full' : 'min-h-full',
      )}
    >
      {/* Header */}
      {mode === 'SMALL' && (
        <div className="flex justify-between items-end mb-2 shrink-0">
          <MonoHeader className="text-sm">ACTION LOG</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">{totalCount} ITEMS</MonoText>
        </div>
      )}

      {/* Stats Row (Small View only per requirement summary request?)
            User said: "in the widget view a short summary is missing"
            "Widget view" implies the Small view tile.
        */}
      {mode === 'SMALL' && (
        <div className="flex gap-4 mb-4 pb-2 border-b border-[var(--los-border)]">
          <div className="flex flex-col">
            <MonoText className="text-[10px] text-[var(--los-muted)]">WEEK</MonoText>
            <MonoText className="text-[12px] text-[var(--los-fg)]">{stats.lastWeek}</MonoText>
          </div>
          <div className="flex flex-col">
            <MonoText className="text-[10px] text-[var(--los-muted)]">MONTH</MonoText>
            <MonoText className="text-[12px] text-[var(--los-fg)]">{stats.lastMonth}</MonoText>
          </div>
          <div className="flex flex-col ml-auto text-right">
            <MonoText className="text-[10px] text-[var(--los-muted)]">TOTAL</MonoText>
            <MonoText className="text-[12px] text-[var(--los-fg)]">{totalCount}</MonoText>
          </div>
        </div>
      )}

      {/* List */}
      <div
        className={cn(
          'flex-1 min-h-0 custom-scrollbar',
          mode === 'SMALL' ? 'overflow-y-auto' : 'overflow-visible',
        )}
      >
        <div className="flex flex-col gap-3">
          {displayEntries.map((entry) => (
            <div
              key={entry.timestamp}
              className="flex flex-col gap-1 border-b border-[var(--los-border)] pb-2 last:border-0 last:pb-0"
            >
              <div className="flex justify-between items-start gap-2">
                {/* Full Timestamp Display Requested */}
                <MonoText className="text-[10px] text-[var(--los-accent)] shrink-0 whitespace-nowrap opacity-70">
                  {entry.timestamp}
                </MonoText>
              </div>
              <MonoText className="text-xs leading-tight break-words whitespace-pre-wrap">
                {entry.description}
              </MonoText>
            </div>
          ))}
          {displayEntries.length === 0 && (
            <div className="text-[var(--los-muted)] text-[10px] text-center mt-4">
              No actions logged yet.
            </div>
          )}
        </div>
      </div>

      {/* Footer for Focus Mode */}
      {mode === 'FOCUS' && (
        <div className="mt-4 pt-4 border-t border-[var(--los-border)] flex justify-between shrink-0">
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            Total: <span className="text-[var(--los-fg)]">{totalCount}</span>
          </MonoText>
          <div className="flex gap-4">
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              Week: {stats.lastWeek}
            </MonoText>
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              Month: {stats.lastMonth}
            </MonoText>
          </div>
        </div>
      )}
    </div>
  );
};
