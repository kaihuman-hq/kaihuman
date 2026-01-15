import { ComponentChildren, h } from 'preact';
import { cn } from '../../utils';

interface MonoProps {
  children: ComponentChildren;
  className?: string;
}

export const MonoHeader = ({ children, className }: MonoProps) => (
  <h2 className={cn("text-lg font-bold uppercase tracking-wider text-[var(--los-fg)]", className)}>
    {children}
  </h2>
);

export const MonoText = ({ children, className }: MonoProps) => (
  <p className={cn("text-sm text-[var(--los-muted)]", className)}>
    {children}
  </p>
);

export const MonoLabel = ({ children, className }: MonoProps) => (
  <span className={cn("text-xs uppercase tracking-widest text-[var(--los-accent)] opacity-80", className)}>
    {children}
  </span>
);
