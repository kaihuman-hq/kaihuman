// Vendored from Cascivo (`npx cascivo add button`) and adapted to Preact:
// React type imports → Preact JSX types, CSS-module class → the stable
// `cascivo-btn` class in ../../cascivo-components.css. The loading spinner was
// dropped (this app never uses the `loading` state).
import { cn, Slot } from '@cascivo/core';
import type { h } from 'preact';

const SlotAny = Slot as unknown as (props: Record<string, unknown>) => h.JSX.Element;

export interface CascivoButtonProps extends h.JSX.HTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  /** Render the single child element instead of a native button (e.g. an <a>). */
  asChild?: boolean;
}

export function CascivoButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  asChild = false,
  className,
  disabled,
  children,
  ...props
}: CascivoButtonProps) {
  const shared = {
    'data-variant': variant,
    'data-size': size,
    'data-state': loading ? 'loading' : 'idle',
    'aria-busy': loading || undefined,
    className: cn('cascivo-btn', className as string | undefined),
  };

  if (asChild) {
    return (
      <SlotAny {...shared} {...props}>
        {children}
      </SlotAny>
    );
  }

  return (
    <button {...shared} disabled={disabled || loading} {...props}>
      <span>{children}</span>
    </button>
  );
}
