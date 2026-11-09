import { describeRepeat, type TodoRepeat, WEEKDAY_NAMES, type Weekday } from '@kaihuman/formats';
import { Repeat } from 'lucide-preact';
import { cn } from '../../../utils';
import {
  REPEAT_PRESETS,
  REPEAT_UNITS,
  type RepeatPreset,
  type RepeatState,
  toggleWeekday,
  weekdayOf,
} from '../../Templates/repeatView';

const FIELD =
  'bg-[var(--los-bg)] border border-[var(--los-border)] text-[10px] font-mono px-1 py-0.5 outline-none focus:border-[var(--los-accent)] disabled:opacity-40';

/** Recurrence picker; disabled until the todo has a due date. */
export const RepeatFields = ({
  dueDate,
  value,
  onChange,
}: {
  dueDate: string;
  value: RepeatState;
  onChange: (next: RepeatState) => void;
}) => {
  const disabled = !dueDate;
  const custom = value.preset === 'custom';
  const weekdays = value.weekdays.length ? value.weekdays : dueDate ? [weekdayOf(dueDate)] : [];
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        aria-label="Repeat"
        value={disabled ? 'none' : value.preset}
        disabled={disabled}
        onChange={(e) => {
          const preset = e.currentTarget.value as RepeatPreset;
          onChange({
            ...value,
            preset,
            weekdays: preset === 'custom' && !value.weekdays.length ? weekdays : value.weekdays,
          });
        }}
        className={FIELD}
      >
        {REPEAT_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.value === 'none' ? 'Does not repeat' : p.label}
          </option>
        ))}
      </select>
      {custom && !disabled && (
        <>
          <span className="text-[10px] font-mono text-[var(--los-muted)]">Every</span>
          <input
            type="number"
            aria-label="Repeat interval"
            min={1}
            max={999}
            value={value.interval}
            onInput={(e) => onChange({ ...value, interval: Number(e.currentTarget.value) || 1 })}
            className={cn(FIELD, 'w-14')}
          />
          <select
            aria-label="Repeat unit"
            value={value.unit}
            onChange={(e) =>
              onChange({ ...value, unit: e.currentTarget.value as RepeatState['unit'] })
            }
            className={FIELD}
          >
            {REPEAT_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
          {value.unit === 'week' && (
            <div className="flex gap-0.5">
              {WEEKDAY_NAMES.map((name, day) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={weekdays.includes(day as Weekday)}
                  onClick={() =>
                    onChange({ ...value, weekdays: toggleWeekday(weekdays, day as Weekday) })
                  }
                  className={cn(
                    'text-[9px] font-mono border px-1 py-0.5 uppercase',
                    weekdays.includes(day as Weekday)
                      ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                      : 'border-[var(--los-border)] text-[var(--los-muted)]',
                  )}
                >
                  {name.slice(0, 2)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Recurrence icon for lists; the tooltip and accessible name spell the rule out. */
export const RepeatIcon = ({ repeat }: { repeat: TodoRepeat }) => {
  const text = describeRepeat(repeat);
  return (
    <span
      role="img"
      title={text}
      aria-label={text}
      className="inline-flex items-center text-[var(--los-muted)]"
    >
      <Repeat size={9} aria-hidden="true" />
    </span>
  );
};
