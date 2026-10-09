import { addActionLogEntry, parseActionLog } from '@kaihuman/formats';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../../Atoms/Typography';
import { ActionLogAddForm } from './ActionLogAddForm';
import { CompactWidgetLayout } from './CompactWidgetLayout';

export interface ActionLogWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ADD' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  onChange?: (newContent: string) => void;
}

export const ActionLogWidget = ({ content, mode, onChange }: ActionLogWidgetProps) => {
  const [focusView, setFocusView] = useState<'log' | 'report'>('log');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);

  const data = useMemo(() => parseActionLog(content), [content]);

  const sortedEntries = useMemo(
    () => [...data.entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [data.entries],
  );

  const totalCount = data.entries.length;

  const stats = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let lastWeek = 0;
    let lastMonth = 0;
    for (const e of data.entries) {
      const d = new Date(e.timestamp);
      if (d >= oneWeekAgo) lastWeek++;
      if (d >= oneMonthAgo) lastMonth++;
    }
    return { lastWeek, lastMonth };
  }, [data.entries]);

  // All unique tags with occurrence counts, sorted by frequency
  const allTags = useMemo(() => {
    const tagCount = new Map<string, number>();
    for (const e of sortedEntries) {
      for (const t of e.tags) {
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      }
    }
    return [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [sortedEntries]);

  // Filtered entries — always operates on the full dataset
  const filteredEntries = useMemo(() => {
    let result = sortedEntries;
    if (activeTag) result = result.filter((e) => e.tags.includes(activeTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [sortedEntries, activeTag, search]);

  // Unfiltered: show 20 most recent. Filtered: show all matches.
  const focusDisplayEntries = useMemo(() => {
    const isFiltered = !!activeTag || !!search.trim();
    return isFiltered ? filteredEntries : filteredEntries.slice(0, 20);
  }, [filteredEntries, activeTag, search]);

  // Report data
  const report = useMemo(() => {
    const byYear = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const byWeek = new Map<string, number>();

    for (const e of sortedEntries) {
      const d = new Date(e.timestamp);
      const year = String(d.getFullYear());
      const month = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      // ISO week key
      const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      const weekKey = `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;

      byYear.set(year, (byYear.get(year) ?? 0) + 1);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
      byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + 1);
    }

    return {
      byYear: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      byMonth: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12),
      byWeek: [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8),
    };
  }, [sortedEntries]);

  const handleAdd = (desc: string, tags: string[]) => {
    onChange?.(addActionLogEntry(content, { description: desc, tags }));
  };

  if (mode === 'ADD') {
    return (
      <div className="w-full min-h-full p-4">
        <ActionLogAddForm onAdd={handleAdd} />
      </div>
    );
  }

  if (mode === 'MOBILE_COLLAPSED') {
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

  if (mode === 'SMALL') {
    return (
      <div className="w-full flex flex-col p-4 relative h-full">
        <div className="flex justify-between items-end mb-2 shrink-0">
          <MonoHeader className="text-sm">ACTION LOG</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">{totalCount} ITEMS</MonoText>
        </div>
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
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col gap-3">
            {sortedEntries.slice(0, 10).map((entry) => (
              <div
                key={entry.timestamp}
                className="flex flex-col gap-1 border-b border-[var(--los-border)] pb-2 last:border-0 last:pb-0"
              >
                <MonoText className="text-[10px] text-[var(--los-accent)] opacity-70 whitespace-nowrap">
                  {entry.timestamp}
                </MonoText>
                <MonoText className="text-xs leading-tight break-words whitespace-pre-wrap">
                  {entry.description}
                </MonoText>
              </div>
            ))}
            {sortedEntries.length === 0 && (
              <div className="text-[var(--los-muted)] text-[10px] text-center mt-4">
                No actions logged yet.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── FOCUS mode ──────────────────────────────────────────────────────────────

  const isFiltered = !!activeTag || !!search.trim();

  const maxYearCount = report.byYear.reduce((m, [, c]) => Math.max(m, c), 1);
  const maxMonthCount = report.byMonth.reduce((m, [, c]) => Math.max(m, c), 1);
  const maxWeekCount = report.byWeek.reduce((m, [, c]) => Math.max(m, c), 1);

  return (
    <div className="w-full flex flex-col gap-4 p-6 min-h-full overflow-y-auto custom-scrollbar">
      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-[var(--los-border)] pb-2">
        {(['log', 'report'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFocusView(v)}
            className={cn(
              'text-[10px] font-mono uppercase tracking-widest px-3 py-1 transition-colors',
              focusView === v
                ? 'text-[var(--los-accent)] border-b-2 border-[var(--los-accent)] -mb-[2px]'
                : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {focusView === 'log' && (
        <>
          {/* Search */}
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search entries..."
            className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-2 text-sm font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50"
          />

          {/* Tag badges */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(showAllTags ? allTags : allTags.slice(0, 10)).map(({ tag, count }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={cn(
                    'text-[10px] font-mono px-2 py-0.5 border transition-colors',
                    activeTag === tag
                      ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/10'
                      : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
                  )}
                >
                  #{tag}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              ))}
              {allTags.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllTags((v) => !v)}
                  className="text-[10px] font-mono px-2 py-0.5 border border-dashed border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)] hover:border-[var(--los-fg)] transition-colors"
                >
                  {showAllTags ? 'Show less' : `+${allTags.length - 10} more`}
                </button>
              )}
            </div>
          )}

          {/* Entry list */}
          <div className="flex flex-col gap-3">
            {focusDisplayEntries.map((entry) => (
              <div
                key={entry.timestamp}
                className="flex flex-col gap-1 border-b border-[var(--los-border)] pb-3 last:border-0 last:pb-0"
              >
                <MonoText className="text-[10px] text-[var(--los-accent)] opacity-70 whitespace-nowrap">
                  {entry.timestamp}
                </MonoText>
                <MonoText className="text-xs leading-tight break-words whitespace-pre-wrap">
                  {entry.description}
                </MonoText>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {entry.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActiveTag(activeTag === t ? null : t)}
                        className="text-[9px] font-mono text-[var(--los-accent)] opacity-70 hover:opacity-100 transition-opacity"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {focusDisplayEntries.length === 0 && (
              <div className="text-[var(--los-muted)] text-[10px] text-center py-8">
                {isFiltered ? 'No entries match the current filter.' : 'No actions logged yet.'}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-[var(--los-border)] flex justify-between text-[9px] font-mono text-[var(--los-muted)]">
            <span>
              {isFiltered
                ? `${focusDisplayEntries.length} of ${totalCount} entries`
                : `${focusDisplayEntries.length} most recent · ${totalCount} total`}
            </span>
            <div className="flex gap-3">
              <span>week {stats.lastWeek}</span>
              <span>month {stats.lastMonth}</span>
            </div>
          </div>
        </>
      )}

      {focusView === 'report' && (
        <div className="flex flex-col gap-6">
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-[var(--los-border)] p-3">
              <MonoLabel className="text-[10px] block mb-1">TOTAL</MonoLabel>
              <span className="text-2xl font-bold font-mono text-[var(--los-fg)]">
                {totalCount}
              </span>
            </div>
            <div className="border border-[var(--los-border)] p-3">
              <MonoLabel className="text-[10px] block mb-1">LAST 7 DAYS</MonoLabel>
              <span className="text-2xl font-bold font-mono text-[var(--los-fg)]">
                {stats.lastWeek}
              </span>
            </div>
            <div className="border border-[var(--los-border)] p-3">
              <MonoLabel className="text-[10px] block mb-1">LAST 30 DAYS</MonoLabel>
              <span className="text-2xl font-bold font-mono text-[var(--los-fg)]">
                {stats.lastMonth}
              </span>
            </div>
          </div>

          {/* Per year */}
          {report.byYear.length > 0 && (
            <div>
              <MonoLabel className="text-[10px] block mb-2">PER YEAR</MonoLabel>
              <div className="flex flex-col gap-1.5">
                {report.byYear.map(([year, count]) => (
                  <div key={year} className="flex items-center gap-3 text-[11px] font-mono">
                    <span className="text-[var(--los-muted)] w-12 shrink-0">{year}</span>
                    <div className="flex-1 h-2 bg-[var(--los-border)]/30 relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-[var(--los-accent)] opacity-70"
                        style={{ width: `${(count / maxYearCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[var(--los-fg)] w-8 text-right shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per month (last 12) */}
          {report.byMonth.length > 0 && (
            <div>
              <MonoLabel className="text-[10px] block mb-2">PER MONTH (LAST 12)</MonoLabel>
              <div className="flex flex-col gap-1.5">
                {report.byMonth.map(([month, count]) => (
                  <div key={month} className="flex items-center gap-3 text-[11px] font-mono">
                    <span className="text-[var(--los-muted)] w-16 shrink-0">{month}</span>
                    <div className="flex-1 h-2 bg-[var(--los-border)]/30 relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-[var(--los-accent)] opacity-70"
                        style={{ width: `${(count / maxMonthCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[var(--los-fg)] w-8 text-right shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per week (last 8) */}
          {report.byWeek.length > 0 && (
            <div>
              <MonoLabel className="text-[10px] block mb-2">PER WEEK (LAST 8)</MonoLabel>
              <div className="flex flex-col gap-1.5">
                {report.byWeek.map(([weekKey, count]) => {
                  const parts = weekKey.split('-W');
                  const label = `W${parseInt(parts[1] ?? '0', 10)}/${parts[0] ?? ''}`;
                  return (
                    <div key={weekKey} className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-[var(--los-muted)] w-16 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-[var(--los-border)]/30 relative">
                        <div
                          className="absolute inset-y-0 left-0 bg-[var(--los-accent)] opacity-70"
                          style={{ width: `${(count / maxWeekCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-[var(--los-fg)] w-8 text-right shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          {allTags.length > 0 && (
            <div>
              <MonoLabel className="text-[10px] block mb-2">TAGS ({allTags.length})</MonoLabel>
              <div className="flex flex-wrap gap-2">
                {allTags.map(({ tag, count }) => (
                  <div
                    key={tag}
                    className="flex items-center gap-1.5 border border-[var(--los-border)] px-2 py-1 text-[10px] font-mono"
                  >
                    <span className="text-[var(--los-accent)]">#{tag}</span>
                    <span className="text-[var(--los-muted)]">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalCount === 0 && (
            <div className="text-[var(--los-muted)] text-[10px] text-center py-8">
              No actions logged yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
