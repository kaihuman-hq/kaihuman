import type { ComponentChildren } from 'preact';
import { cn } from '../../../utils';

interface CompactWidgetLayoutProps {
  children: ComponentChildren;
  className?: string;
}

export const CompactWidgetLayout = ({ children, className }: CompactWidgetLayoutProps) => {
  return <div className={cn('flex flex-col h-full w-full p-4 gap-4', className)}>{children}</div>;
};

export const CompactHero = ({
  children,
  className,
}: {
  children: ComponentChildren;
  className?: string;
}) => (
  <div className={cn('flex flex-col items-center justify-center text-center shrink-0', className)}>
    {children}
  </div>
);

export const CompactList = ({
  children,
  className,
}: {
  children: ComponentChildren;
  className?: string;
}) => <div className={cn('flex-1 min-h-0 overflow-y-auto w-full', className)}>{children}</div>;

export const CompactFooter = ({
  children,
  className,
}: {
  children: ComponentChildren;
  className?: string;
}) => (
  <div
    className={cn('mt-auto shrink-0 w-full pt-2 border-t border-[var(--los-border)]', className)}
  >
    {children}
  </div>
);
