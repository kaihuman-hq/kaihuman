import { ComponentChildren, h, cloneElement, toChildArray, VNode } from 'preact';
import { cn } from '../../utils';

export type GridState = 'DASHBOARD' | 'FOCUS' | 'ZEN';

export interface MainGridProps {
  children: ComponentChildren;
  viewState?: GridState;
  activeTileId?: string | null;
  className?: string;
}

export const MainGrid = ({
  children,
  viewState = 'DASHBOARD',
  activeTileId,
  className
}: MainGridProps) => {
  const kids = toChildArray(children) as VNode<any>[];

  return (
    <div className={cn(
      "life-os-root h-screen w-screen bg-[var(--los-bg)] overflow-hidden",
      "grid transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]", // Spring-ish CSS
      // Desktop grid definition
      "grid-cols-1", // Mobile default (Stack)
      // Desktop (md+)
      // State A: DASHBOARD - 1fr 2fr 1fr
      viewState === 'DASHBOARD' && "md:grid-cols-[minmax(250px,1fr)_minmax(400px,2fr)_minmax(250px,1fr)]",
      // State B: FOCUS - 60px 1fr 60px
      viewState === 'FOCUS' && "md:grid-cols-[60px_1fr_60px]",
      // State C: ZEN - 0px 1fr 0px
      viewState === 'ZEN' && "md:grid-cols-[0px_1fr_0px]",

      className
    )}>
      {kids.map((child, index) => {
        // Assume strictly 3 children for desktop logic: [Left, Center, Right]
        const column = index === 0 ? 'left' : index === 1 ? 'center' : 'right';
        const isCollapsed = viewState !== 'DASHBOARD' && column !== 'center';

        return cloneElement(child, {
          column,
          isCollapsed,
          className: cn(
            child.props.className,
            "h-full w-full",
            // Mobile Logic: Show only Center unless on Dashboard? Or just stack?
            // User said "Stack or Carousel". For now, let's just stack them vertically on mobile via grid-cols-1
            // But MainGrid has h-screen, so they might overflow.
            // Let's enforce h-full.
          )
        });
      })}
    </div>
  );
};
