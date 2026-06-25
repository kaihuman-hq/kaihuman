// Vendored from Cascivo (`npx cascivo add input`) and adapted to Preact:
// React type imports → Preact JSX types, CSS-module classes → the stable
// `cascivo-field*` classes in ../../cascivo-components.css.
import { cn, createMachine, useMachine } from '@cascivo/core';
import type { h } from 'preact';

const machine = createMachine({
  initial: 'idle' as const,
  states: {
    idle: { on: { FOCUS: 'focused' } },
    focused: { on: { BLUR: 'idle' } },
  },
});

export interface CascivoInputProps extends Omit<h.JSX.HTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function CascivoInput({
  label,
  hint,
  error,
  size = 'md',
  className,
  id,
  onFocus,
  onBlur,
  ...props
}: CascivoInputProps) {
  const [state, send] = useMachine(machine);
  const inputId =
    id ?? (label ? `cascade-input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div
      className={cn('cascivo-field', className as string | undefined)}
      data-state={error ? 'error' : state.value}
      data-size={size}
    >
      {label && (
        <label className="cascivo-field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className="cascivo-field-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        onFocus={(e) => {
          send('FOCUS');
          onFocus?.(e);
        }}
        onBlur={(e) => {
          send('BLUR');
          onBlur?.(e);
        }}
        {...props}
      />
      {error && (
        <span id={`${inputId}-error`} className="cascivo-field-error" role="alert">
          {error}
        </span>
      )}
      {!error && hint && (
        <span id={`${inputId}-hint`} className="cascivo-field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
