import type { h } from 'preact';
import { cn } from '../utils';

export interface PanelProps extends h.JSX.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'bordered';
}

export const Panel = ({ className, variant = 'default', ...props }: PanelProps) => {
  const variants = {
    default: 'bg-nexus-panel border border-nexus-border',
    glass: 'bg-nexus-panel/50 backdrop-blur-md border border-nexus-border/50',
    bordered: 'bg-transparent border border-nexus-border',
  };

  return (
    <div
      className={cn('rounded-lg p-4 text-nexus-text', variants[variant], className)}
      {...props}
    />
  );
};
