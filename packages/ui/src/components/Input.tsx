import { h } from 'preact';
import { cn } from '../utils';
import { forwardRef } from 'preact/compat';

export interface InputProps extends h.JSX.HTMLAttributes<HTMLInputElement> {
  type?: string;
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-nexus-border bg-nexus-panel px-3 py-2 text-sm text-nexus-text ring-offset-nexus-bg file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-nexus-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-nexus-primary focus-visible:border-nexus-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
          error && 'border-nexus-accent focus-visible:ring-nexus-accent',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
