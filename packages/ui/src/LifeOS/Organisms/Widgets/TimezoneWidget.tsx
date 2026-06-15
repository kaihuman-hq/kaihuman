import { Calendar, Globe, Trash2 } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import {
  getCurrentTimeInZone,
  getISOWeekNumber,
  getYearProgress,
  parseTimezones,
  type TimezoneData,
} from './TimezoneLogic';

export interface TimezoneWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED';
  className?: string;
  onChange?: (newContent: string) => void;
}

export const TimezoneWidget = ({ content, mode, className, onChange }: TimezoneWidgetProps) => {
  const data: TimezoneData = useMemo(() => parseTimezones(content), [content]);

  // Ticker for live clock — pauses when the tab is hidden to avoid wasted work
  const [_now, setNow] = useState(Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      timer = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => clearInterval(timer);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const yearProgress = getYearProgress();

  // If no data, show placeholder
  if (data.timezones.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col h-full w-full justify-center items-center text-[var(--los-muted)]',
          className,
        )}
      >
        <Globe size={24} className="mb-2 opacity-50" />
        <MonoText>No Timezones Configured</MonoText>
      </div>
    );
  }

  // Primary Timezone (First one)
  const primaryTz = data.timezones[0];
  if (!primaryTz) return null; // Should be handled by length check above, but for TS safety
  const _primaryTime = getCurrentTimeInZone(primaryTz.name);

  // Logic for User's Local Time (System Time) - Used as main display in both modes
  const localTzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = getCurrentTimeInZone(localTzName);

  if (mode === 'SMALL' || mode === 'MOBILE_EXPANDED') {
    return (
      <div className={cn('flex flex-col h-full w-full p-2', className)}>
        {/* Top: Local Time Info */}
        <div className="flex-1 flex flex-col justify-center items-center text-center">
          <MonoHeader className="text-3xl mb-1">{localTime.time}</MonoHeader>

          <div className="flex items-center gap-2 text-[var(--los-muted)] mb-2">
            <Calendar size={12} />
            <MonoText className="text-[10px] uppercase">{localTime.date}</MonoText>
          </div>

          <div className="flex items-center gap-2 text-[var(--los-accent)]">
            <MonoText className="text-[10px] font-bold">
              WEEK {getISOWeekNumber(new Date())}
            </MonoText>
          </div>

          <MonoText className="text-[10px] text-[var(--los-muted)] mt-2 opacity-70">
            {localTzName.replace('_', ' ')}
          </MonoText>
        </div>

        {/* Extra Timezones */}
        <div className="flex w-full gap-2 mt-2 mb-2">
          {data.timezones.slice(0, 2).map((tz) => {
            const tzTime = getCurrentTimeInZone(tz.name);
            const city = tz.cities[0] || tz.name.split('/')[1]?.replace(/_/g, ' ') || tz.name;
            return (
              <div
                key={tz.id}
                className="flex-1 flex flex-col items-center bg-white/5 rounded-md p-1 min-w-0"
              >
                <MonoHeader className="text-sm font-bold">{tzTime.time}</MonoHeader>
                <MonoText className="text-[8px] text-[var(--los-muted)] truncate w-full text-center uppercase tracking-wider">
                  {city}
                </MonoText>
              </div>
            );
          })}
        </div>

        {/* Bottom: Year Progress */}
        <div className="mt-auto pt-4 border-t border-[var(--los-border)]">
          <div className="flex justify-between items-end mb-1">
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              Day {yearProgress.dayOfYear}
            </MonoText>
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              {yearProgress.daysRemaining} Left
            </MonoText>
          </div>

          <div className="h-1.5 w-full bg-[var(--los-border)] rounded-full overflow-hidden relative">
            <div
              className="absolute top-0 left-0 bottom-0 bg-[var(--los-accent)] transition-all duration-1000"
              style={{ width: `${yearProgress.percentage}%` }}
            />
          </div>
          <div className="text-center mt-1">
            <MonoText className="text-[10px] font-bold">
              {yearProgress.percentage.toFixed(1)}%
            </MonoText>
          </div>
        </div>
      </div>
    );
  }

  // FOCUS MODE
  return (
    <div className={cn('flex flex-col h-full w-full', className)}>
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div className="flex items-end gap-4">
          <MonoHeader className="text-4xl">{localTime.time}</MonoHeader>
          <div className="flex flex-col pb-1">
            <MonoText className="text-sm text-[var(--los-accent)]">
              {localTzName.replace('_', ' ')}
            </MonoText>
            <MonoText className="text-[10px] text-[var(--los-muted)]">{localTime.date}</MonoText>
          </div>
        </div>
      </div>

      <MonoHeader className="text-sm border-b border-[var(--los-border)] pb-2 mb-4">
        WORLD CLOCK
      </MonoHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto pr-2 pb-4">
        {data.timezones.map((tz) => {
          const time = getCurrentTimeInZone(tz.name);
          const _isPrimary = tz.id === primaryTz.id;

          return (
            <div
              key={tz.id}
              className="bg-[var(--los-bg)] border border-[var(--los-border)] p-4 relative group hover:border-[var(--los-accent)] transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <MonoText className="text-xs text-[var(--los-muted)]">
                  {tz.cities.join(', ')}
                </MonoText>
                {onChange && (
                  <button
                    type="button"
                    onClick={() => {
                      // Remove logic
                      const newData = {
                        ...data,
                        timezones: data.timezones.filter((t) => t.id !== tz.id),
                      };
                      onChange(JSON.stringify(newData, null, 2));
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--los-muted)] hover:text-red-500 transition-all p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="flex justify-between items-end">
                <MonoHeader className="text-2xl">{time.time}</MonoHeader>
                <div className="text-right">
                  <MonoText className="text-[10px] text-[var(--los-muted)] block">
                    {time.date}
                  </MonoText>
                  <MonoText className="text-[10px] text-[var(--los-accent)] block mt-0.5">
                    {tz.offset}
                  </MonoText>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Year Progress Large */}
      <div className="mt-auto border-t border-[var(--los-border)] pt-6">
        <MonoHeader className="text-sm mb-4">YEAR PROGRESS {new Date().getFullYear()}</MonoHeader>
        <div className="relative h-4 w-full bg-[var(--los-border)] rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 bottom-0 bg-[var(--los-accent)]"
            style={{ width: `${yearProgress.percentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <div className="text-left">
            <MonoText className="text-xs font-bold">{yearProgress.dayOfYear} DAYS GONE</MonoText>
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              {yearProgress.percentage.toFixed(2)}% COMPLETED
            </MonoText>
          </div>
          <div className="text-right">
            <MonoText className="text-xs font-bold">
              {yearProgress.daysRemaining} DAYS LEFT
            </MonoText>
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              UNTIL {new Date().getFullYear() + 1}
            </MonoText>
          </div>
        </div>
      </div>
    </div>
  );
};
