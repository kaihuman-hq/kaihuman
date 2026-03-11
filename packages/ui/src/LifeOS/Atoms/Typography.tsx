import type { ComponentChildren, h } from 'preact';
import { cn } from '../../utils';

interface MonoProps extends h.JSX.HTMLAttributes<any> {
  children: ComponentChildren;
  className?: string;
}

export const MonoHeader = ({ children, className, ...props }: MonoProps) => (
  <h2
    className={cn('text-lg font-bold uppercase tracking-wider text-[var(--los-fg)]', className)}
    {...props}
  >
    {children}
  </h2>
);

export const MonoText = ({ children, className, ...props }: MonoProps) => (
  <p className={cn('text-sm text-[var(--los-muted)]', className)} {...props}>
    {children}
  </p>
);

export const MonoLabel = ({ children, className, ...props }: MonoProps) => (
  <span
    className={cn(
      'text-xs uppercase tracking-widest text-[var(--los-accent)] opacity-80',
      className,
    )}
    {...props}
  >
    {children}
  </span>
);
