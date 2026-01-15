import { h } from 'preact';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { cn } from '../utils';

export interface ButtonProps extends h.JSX.HTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = ({
  className,
  variant = 'primary',
  size = 'md',
  label,
  children,
  ...props
}: ButtonProps & { label?: string }) => {
  const variants = {
    primary: 'bg-nexus-primary text-nexus-bg hover:bg-[#33f2ff] hover:shadow-[0_0_15px_rgba(0,240,255,0.5)] border-none',
    secondary: 'bg-nexus-secondary text-white hover:bg-[#8020ff] hover:shadow-[0_0_15px_rgba(112,0,255,0.5)] border-none',
    ghost: 'bg-transparent text-nexus-text hover:bg-white/10 border-none',
    outline: 'bg-transparent text-nexus-primary border border-nexus-primary hover:bg-nexus-primary/10 hover:shadow-[0_0_10px_rgba(0,240,255,0.3)]',
    danger: 'bg-nexus-accent text-white hover:bg-[#ff2055] hover:shadow-[0_0_15px_rgba(255,0,60,0.5)] border-none',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
    icon: 'h-10 w-10 p-2 flex items-center justify-center',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-nexus-primary disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {label || children}
    </button>
  );
};
