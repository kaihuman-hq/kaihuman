import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { parseHabitData, isCheckedIn, checkIn, calculateStats, HabitData } from './HabitTrackerLogic';
import { Logger } from '@lifosy/core';

const logger = new Logger('HabitTrackerWidget');

interface HabitTrackerWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS';
  onChange?: (newContent: string) => void;
}

export const HabitTrackerWidget = ({ content, mode, onChange }: HabitTrackerWidgetProps) => {
  const data = useMemo(() => parseHabitData(content), [content]);
  const stats = useMemo(() => calculateStats(data), [data]);

  // Calculations for the graph (last ~5 months or filling the view)
  // For small view, we probably want a fixed number of weeks, e.g., 20 weeks (~5 months) or just fill available space.
  // GitHub shows a whole year usually, but for a widget, maybe less.
  // Let's aim for ~16 weeks (4 months) for now to ensure it fits well.
  const weeksToShow = 20;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate start date (Sunday of the week 'weeksToShow' ago)
  const endDate = today;
  const endDayOfWeek = endDate.getDay(); // 0 (Sun) - 6 (Sat)

  // We want the last column to include today. 
  // We generate weeks back from today's week.

  const toLocDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const matrix = useMemo(() => {
    const params: { date: Date; status: boolean; isToday: boolean }[][] = [];

    // Start from the Sunday of the current week (or future if we want full week)
    // Actually typically GitHub graph ends at today or end of this week.
    // Let's make the last column the current week.

    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay()); // Go back to Sunday

    for (let w = 0; w < weeksToShow; w++) {
      const weekData: { date: Date; status: boolean; isToday: boolean }[] = [];
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - ((weeksToShow - 1 - w) * 7));

      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + d);

        const iso = toLocDate(dayDate);
        const status = data.entries.some(e => e.date === iso && e.reached);
        const isToday = dayDate.getTime() === today.getTime();

        weekData.push({ date: dayDate, status, isToday });
      }
      params.push(weekData);
    }
    return params;
  }, [data, today]);



  // Interaction Handlers
  const handleCheckIn = (targetDate: Date) => {
    if (!onChange) {
      logger.warn("No onChange handler provided");
      return;
    }
    const iso = toLocDate(targetDate);
    const newContent = checkIn(content, iso);

    onChange(newContent);
  };

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isCheckedToday = isCheckedIn(content, toLocDate(today));
  const isCheckedYesterday = isCheckedIn(content, toLocDate(yesterday));

  // Render Month Labels
  // We need to check where months change in the columns.
  const monthLabels = useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let lastMonth = -1;

    matrix.forEach((week, index) => {
      // Check the first day of the week to decide month label? 
      // Or check if the week contains the 1st of a month?
      // GitHub puts label over the column where the month starts roughly.
      const firstDay = week[0]?.date;
      if (!firstDay) return;
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        labels.push({ index, label: firstDay.toLocaleString('default', { month: 'short' }) });
        lastMonth = month;
      }
    });
    return labels;
  }, [matrix]);

  const streakText = useMemo(() => {
    if (stats.currentStreak > 0) {
      return `You reached ${stats.currentStreak} goal${stats.currentStreak === 1 ? '' : 's'} in a row! Total: ${stats.totalCount}`;
    }
    return `Start a streak today! Total completed: ${stats.totalCount}`;
  }, [stats]);

  return (
    <div className={cn("flex flex-col w-full gap-4", mode === 'SMALL' ? "h-full" : "min-h-full")}>
      {/* Activity Graph */}
      <div className="flex flex-col gap-1 overflow-x-auto pb-2 min-h-0 shrink-0">
        {/* Month Labels */}
        <div className="flex text-[10px] text-[var(--los-muted)] h-4 relative">
          {monthLabels.map(l => (
            <div key={l.index} className="absolute" style={{ left: `${l.index * 14}px` }}> {/* 12px box + 2px gap */}
              {l.label}
            </div>
          ))}
        </div>

        <div className="flex gap-[2px]">
          {matrix.map((week, wIndex) => (
            <div key={wIndex} className="flex flex-col gap-[2px]">
              {week.map((day, dIndex) => (
                <div
                  key={dIndex}
                  title={`${day.date.toDateString()}${day.status ? ' (Done)' : ''}`}
                  className={cn(
                    "w-3 h-3 rounded-[1px] transition-colors",
                    day.status
                      ? (day.isToday ? "bg-[var(--los-accent)] ring-1 ring-white" : "bg-[var(--los-accent)]")
                      : "bg-white/10 hover:bg-white/20",
                    day.isToday && !day.status && "ring-1 ring-[var(--los-muted)]"
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-2">
        <MonoText className="text-xs text-[var(--los-muted)]">
          {streakText}
        </MonoText>
      </div>


      <div className={cn(
        "flex flex-col gap-4 mt-4",
        mode === 'FOCUS' && "p-4 border-t border-[var(--los-border)]"
      )}>
        {mode === 'FOCUS' && <MonoHeader>Check In</MonoHeader>}
        <div className="flex gap-2 flex-wrap">
          <button
            disabled={isCheckedToday}
            onClick={(e) => { e.stopPropagation(); handleCheckIn(today); }}
            className={cn(
              "px-3 py-1 text-[10px] font-mono border rounded-sm transition-all flex-1 text-center whitespace-nowrap",
              isCheckedToday
                ? "bg-[var(--los-accent)] text-black border-[var(--los-accent)] cursor-not-allowed opacity-50"
                : "border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-black"
            )}
          >
            {isCheckedToday ? "TODAY DONE" : "CHECK IN TODAY"}
          </button>

          <button
            disabled={isCheckedYesterday}
            onClick={(e) => { e.stopPropagation(); handleCheckIn(yesterday); }}
            className={cn(
              "px-3 py-1 text-[10px] font-mono border rounded-sm transition-all flex-1 text-center whitespace-nowrap",
              isCheckedYesterday
                ? "bg-[var(--los-muted)] text-black border-[var(--los-muted)] cursor-not-allowed opacity-50 input-disabled"
                : "border-[var(--los-muted)] text-[var(--los-muted)] hover:bg-[var(--los-muted)] hover:text-black"
            )}
          >
            {isCheckedYesterday ? "YESTERDAY DONE" : "CHECK IN YESTERDAY"}
          </button>
        </div>
      </div>
    </div>
  );
};
