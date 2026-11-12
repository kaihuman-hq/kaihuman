import { DUE_QUICK_PICK_LABELS, type DueQuickPick, dueQuickPick } from '@kaihuman/formats';
import { CalendarDays, X } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../../utils';

const PICKS = Object.keys(DUE_QUICK_PICK_LABELS) as DueQuickPick[];

const CHIP =
  'text-[10px] font-mono px-2 py-0.5 border transition-colors border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)]';
const CHIP_ON = 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5';

/** Today / Tomorrow / Next week chips, a date input and a clear button; `''` means no date. */
export const DueQuickPicks = ({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (date: string) => void;
  className?: string;
}) => (
  <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
    {PICKS.map((pick) => {
      const date = dueQuickPick(pick);
      return (
        <button
          key={pick}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(date);
          }}
          className={cn(CHIP, value === date && CHIP_ON)}
          title={date}
        >
          {DUE_QUICK_PICK_LABELS[pick]}
        </button>
      );
    })}
    <input
      type="date"
      aria-label="Due date"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onInput={(e) => onChange(e.currentTarget.value)}
      className="bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-0.5 text-[10px] font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
    />
    {value && (
      <button
        type="button"
        aria-label="Clear due date"
        onClick={(e) => {
          e.stopPropagation();
          onChange('');
        }}
        className="text-[var(--los-muted)] hover:text-red-400 transition-colors"
      >
        <X size={12} />
      </button>
    )}
  </div>
);

/** A trigger (the due badge, or "+ DUE") that opens the quick picks in a dropdown. */
export const DuePicker = ({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (date: string) => void;
  children?: ComponentChildren;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label="Set due date"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 hover:opacity-80"
      >
        {children ?? (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-mono border border-dashed border-[var(--los-border)] px-1 text-[var(--los-muted)] hover:text-[var(--los-accent)] hover:border-[var(--los-accent)]">
            <CalendarDays size={9} />
            DUE
          </span>
        )}
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: dropdown dismiss on mouse leave
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-xl p-2 w-max max-w-[18rem]"
          onMouseLeave={() => setOpen(false)}
        >
          <DueQuickPicks
            value={value}
            onChange={(date) => {
              onChange(date);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};
