import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { parseEvents, getUpcomingEvents, EventsData } from './EventsLogic';
import { cn } from '../../../utils';
import { Calendar, Gift } from 'lucide-preact';

export interface EventsWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS';
  className?: string; // For layout flexibility
}

export const EventsWidget = ({ content, mode, className }: EventsWidgetProps) => {
  const data: EventsData = useMemo(() => parseEvents(content), [content]);
  const upcoming = useMemo(() => getUpcomingEvents(data, mode === 'SMALL' ? 8 : undefined), [data, mode]);

  if (upcoming.length === 0) {
    return (
      <div className={cn("flex flex-col h-full w-full justify-center items-center text-[var(--los-muted)]", className)}>
        <MonoText>No upcoming events.</MonoText>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <MonoHeader className="text-lg">UPCOMING</MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)]">
          {upcoming.length} EVENT{upcoming.length !== 1 ? 'S' : ''}
        </MonoText>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto min-h-0 border-t border-[var(--los-border)]">
        {upcoming.map((item, i) => (
          <div
            key={i}
            className="group flex items-start gap-3 py-3 border-b border-[var(--los-border)] last:border-0 hover:bg-white/5 transition-colors px-1"
          >
            {/* Icon / Leading */}
            <div className={cn(
              "mt-0.5 shrink-0",
              item.entry.type === 'birthday' ? "text-pink-500" : "text-[var(--los-accent)]"
            )}>
              {item.entry.type === 'birthday' ? <Gift size={14} /> : <Calendar size={14} />}
            </div>

            {/* Main Info */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <MonoText className={cn(
                  "text-xs truncate mr-2",
                  item.entry.type === 'birthday' ? "text-pink-400" : "text-[var(--los-fg)]"
                )}>
                  {item.entry.name}
                </MonoText>

                {/* Duration Label (Right aligned) */}
                <MonoText className={cn(
                  "text-[10px] shrink-0",
                  item.daysUntil <= 1 ? "text-[var(--los-accent)] font-bold" : "text-[var(--los-muted)]"
                )}>
                  {item.durationLabel}
                </MonoText>
              </div>

              {/* Date Subtitle */}
              <MonoText className="text-[10px] text-[var(--los-muted)] mt-0.5">
                {item.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </MonoText>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint if truncated */}
      {mode === 'SMALL' && getUpcomingEvents(data, 100).length > 8 && ( // Check if more exist
        <div className="text-center pt-2 border-t border-[var(--los-border)]">
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            + {getUpcomingEvents(data, 100).length - 8} more in Focus Mode
          </MonoText>
        </div>
      )}
    </div>
  );
};
