import type { Scope } from '@kaihuman/formats/business';
import { cn } from '../../utils';

const SEGMENTS: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'business', label: 'Business' },
  { value: 'personal', label: 'Personal' },
];

export const ScopeToggle = ({
  value,
  onChange,
}: {
  value: Scope;
  onChange: (next: Scope) => void;
}) => (
  <fieldset
    className="flex items-center border border-[var(--los-border)] shrink-0 m-0 p-0 min-w-0"
    aria-label="Show"
  >
    {SEGMENTS.map((s) => (
      <button
        key={s.value}
        type="button"
        aria-pressed={value === s.value}
        onClick={() => onChange(s.value)}
        className={cn(
          'text-[10px] font-mono px-2 py-1 transition-colors',
          value === s.value
            ? 'text-[var(--los-accent)] bg-[var(--los-accent)]/5'
            : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
        )}
      >
        {s.label}
      </button>
    ))}
  </fieldset>
);
