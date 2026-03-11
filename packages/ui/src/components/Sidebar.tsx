import type { h } from 'preact';
import { cn } from '../utils';

export interface SidebarProps extends h.JSX.HTMLAttributes<HTMLDivElement> {
  width?: string;
}

export const Sidebar = ({ className, width = 'w-64', ...props }: SidebarProps) => {
  return (
    <div
      className={cn(
        'flex flex-col border-r border-nexus-border bg-nexus-panel h-full',
        width,
        className,
      )}
      {...props}
    />
  );
};

export const SidebarHeader = ({ className, ...props }: h.JSX.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('p-4 border-b border-nexus-border h-14 flex items-center', className)}
    {...props}
  />
);

export const SidebarContent = ({ className, ...props }: h.JSX.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-auto p-2', className)} {...props} />
);

export const SidebarFooter = ({ className, ...props }: h.JSX.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4 border-t border-nexus-border', className)} {...props} />
);
