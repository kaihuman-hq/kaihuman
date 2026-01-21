import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { Play, Square, Pause } from 'lucide-preact';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import {
  parseTimeTracking,
  serializeTimeTracking,
  calculateDurationMinutes,
  formatDuration,
  toggleStartStop,
  addPause,
  isRunning,
  TimeTrackingData
} from './TimeTrackingLogic';
import { cn } from '../../../utils';

export interface TimeTrackingWidgetProps {
  content: string;
  onChange: (newContent: string) => void;
  mode: 'SMALL' | 'FOCUS';
}

export const TimeTrackingWidget = ({ content, onChange, mode }: TimeTrackingWidgetProps) => {
  const data: TimeTrackingData = useMemo(() => parseTimeTracking(content), [content]);
  const active = isRunning(data);

  // Calculate Today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = data.entries.find(e => e.date === today);
  const todayMinutes = todayEntry ? calculateDurationMinutes(todayEntry) : 0;

  // Calculate Current Week Stats (Simulated: sum of last 7 entries for simplicity/demo)
  // Real week logic requires date math, but "Duration of time tracking for current week" requested.
  // We'll just sum all parsed entries for now as "Total Tracked" if date math is overkill, 
  // but let's try to filter correctly.
  // Calculate Current Week Stats (Current ISO Week - Start Monday)
  const weekMinutes = useMemo(() => {
    const now = new Date();
    const day = now.getDay() || 7; // Sunday is 7
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - day + 1);

    // Normalize to YYYY-MM-DD string to match data format
    // Note: toISOString() uses UTC. We need local YYYY-MM-DD.
    // Use the utility/offset trick or simple getters.
    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    const mondayStr = `${year}-${month}-${d}`;

    return data.entries
      .filter(e => e.date >= mondayStr)
      .reduce((acc, curr) => acc + calculateDurationMinutes(curr), 0);
  }, [data]);

  const handleStartStop = (e: Event) => {
    e.stopPropagation();
    const newData = toggleStartStop(data);
    onChange(serializeTimeTracking(newData));
  };

  const handlePause = (minutes: number) => (e: Event) => {
    e.stopPropagation();
    const newData = addPause(data, minutes);
    onChange(serializeTimeTracking(newData));
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* HEADER STATS */}
      <div className="flex justify-between items-end mb-4 shrink-0">
        <div>
          <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-wide">
            Today
          </MonoText>
          <MonoHeader className={cn(
            "text-2xl",
            active ? "text-[var(--los-accent)]" : "text-[var(--los-fg)]"
          )}>
            {formatDuration(todayMinutes)}
          </MonoHeader>
        </div>
        <div className="text-right">
          <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-wide">
            This Week
          </MonoText>
          <MonoText className="text-sm">
            {formatDuration(weekMinutes)}
          </MonoText>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="grid grid-cols-2 gap-2 mb-4 shrink-0">
        <button
          onClick={handleStartStop}
          className={cn(
            "flex items-center justify-center gap-2 p-3 border transition-all active:scale-95 group",
            active
              ? "border-[var(--los-accent)] bg-[var(--los-accent)] text-black"
              : "border-[var(--los-border)] hover:bg-white/5 text-[var(--los-fg)]"
          )}
        >
          {active ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          <MonoText className="font-bold">{active ? "STOP" : "START"}</MonoText>
        </button>

        {/* Pause Menu */}
        <div className="flex gap-1">
          {[15, 30, 60].map(min => (
            <button
              key={min}
              onClick={handlePause(min)}
              disabled={todayMinutes < min}
              className={cn(
                "flex-1 border border-[var(--los-border)] flex flex-col items-center justify-center hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
                "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
              )}
              title={`Add ${min}m Pause`}
            >
              <Pause size={12} />
              <span className="text-[10px] font-mono mt-1">{min}m</span>
            </button>
          ))}
        </div>
      </div>

      {/* HISTORY LIST (Visible in both, but expaned in FOCUS) */}
      <div className="flex-1 overflow-y-auto min-h-0 border-t border-[var(--los-border)] pt-2 relative">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="py-2 text-[10px] text-[var(--los-muted)] uppercase font-normal border-b border-[var(--los-border)]">Date</th>
              <th className="py-2 text-[10px] text-[var(--los-muted)] uppercase font-normal border-b border-[var(--los-border)] text-right">Hours</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.slice(0, mode === 'SMALL' ? 5 : undefined).map((entry) => (
              <tr key={entry.date} className="group hover:bg-white/5">
                <td className="py-2 text-xs font-mono text-[var(--los-muted)] group-hover:text-[var(--los-fg)]">
                  {entry.date === today ? "Today" : entry.date}
                </td>
                <td className="py-2 text-xs font-mono text-right">
                  {formatDuration(calculateDurationMinutes(entry))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {mode === 'SMALL' && data.entries.length > 5 && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[var(--los-bg)] to-transparent pointer-events-none flex items-end justify-center pb-1">
            <MonoText className="text-[10px] text-[var(--los-muted)]">...and {data.entries.length - 5} more</MonoText>
          </div>
        )}
      </div>
    </div>
  );
};
