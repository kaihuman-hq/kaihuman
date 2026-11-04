import {
  cyclePriority,
  PRIORITY_LABELS,
  TODO_COLOR_HEX,
  TODO_COLORS,
  type TodoColor,
  type TodoData,
  type TodoPriority,
} from '@kaihuman/formats';
import { Palette } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';

const PRIORITY_UI: Record<TodoPriority, { glyph: string; className: string }> = {
  high: { glyph: '!', className: 'text-amber-400' },
  'super-high': { glyph: '!!', className: 'text-orange-500' },
  'ultra-high': { glyph: '!!!', className: 'text-red-500' },
};

export const priorityMark = (
  p: TodoPriority | undefined,
): { glyph: string; className: string; title: string } => {
  const next = cyclePriority(p);
  const hint = `click: ${next ? PRIORITY_LABELS[next].toLowerCase() : 'clear'}`;
  if (!p)
    return { glyph: '!', className: 'text-[var(--los-muted)]', title: `Set priority (${hint})` };
  return { ...PRIORITY_UI[p], title: `${PRIORITY_LABELS[p]} priority (${hint})` };
};

export const fileColorHex = (data: Pick<TodoData, 'color'>): string | undefined =>
  data.color ? TODO_COLOR_HEX[data.color] : undefined;

/** Click cycles none → ! → !! → !!! → none; unset stays faint so it can be found. */
export const PriorityBadge = ({
  priority,
  onCycle,
}: {
  priority?: TodoPriority;
  onCycle: () => void;
}) => {
  const m = priorityMark(priority);
  return (
    <button
      type="button"
      title={m.title}
      aria-label={m.title}
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
      className={cn(
        'shrink-0 min-w-[1.25rem] text-[10px] font-mono font-bold leading-none hover:opacity-80 transition-opacity',
        m.className,
        !priority && 'opacity-30 group-hover:opacity-70 group-focus-within:opacity-70',
      )}
    >
      {m.glyph}
    </button>
  );
};

export const FileColorPicker = ({
  color,
  onChange,
  label,
}: {
  color?: TodoColor;
  onChange: (color?: TodoColor) => void;
  label: string;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (c?: TodoColor) => {
    onChange(c);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative shrink-0 flex items-center">
      <button
        type="button"
        title={`File color: ${color ?? 'none'}`}
        aria-label={`Color for ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={color ? { backgroundColor: TODO_COLOR_HEX[color] } : undefined}
        className={cn(
          'flex items-center justify-center rounded-full transition-colors',
          color
            ? 'w-3 h-3 border border-[var(--los-border)] hover:border-[var(--los-fg)]'
            : 'w-4 h-4 text-[var(--los-muted)] hover:text-[var(--los-fg)]',
        )}
      >
        {!color && <Palette size={12} aria-hidden="true" />}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 grid grid-cols-6 gap-1 p-1.5 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-lg">
          <button
            type="button"
            title="No color"
            aria-label="No color"
            onClick={() => pick(undefined)}
            className={cn(
              'w-4 h-4 rounded-full border border-[var(--los-border)] text-[9px] leading-none text-[var(--los-muted)]',
              !color && 'ring-1 ring-[var(--los-fg)]',
            )}
          >
            ×
          </button>
          {TODO_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={c}
              onClick={() => pick(c)}
              style={{ backgroundColor: TODO_COLOR_HEX[c] }}
              className={cn('w-4 h-4 rounded-full', color === c && 'ring-1 ring-[var(--los-fg)]')}
            />
          ))}
        </div>
      )}
    </div>
  );
};
