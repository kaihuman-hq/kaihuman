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
  console.log('[MainGrid] Rendering. viewState:', viewState);
  console.log('[MainGrid] Children count:', kids.length);
  kids.forEach((k, i) => console.log(`[MainGrid] Child ${i}:`, k));

  return (
    <div className={cn(
      "life-os-root h-screen w-screen bg-[var(--los-bg)] overflow-hidden",
      "grid transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]", // Spring-ish CSS
      // Desktop grid definition
      "grid-cols-1", // Mobile default (Stack)
      // Desktop (md+)
      // State A: DASHBOARD - 1fr 2fr 1fr
      viewState === 'DASHBOARD' && "md:grid-cols-[minmax(250px,1fr)_minmax(400px,2fr)_minmax(250px,1fr)]",
      // State B: FOCUS - Wide Center, Squares on sides (if screen large enough)
      // "Reasonable Width" for center (~800px-1200px?) and "Squared" for sides.
      // Let's rely on flex/grid sizing. 1fr for center, and min-content or specific aspect ratio for sides?
      // Grid cols can't enforce aspect ratio directly on the column width relative to row height easily without JS or subgrid.
      // But we can just set them to a fixed reasonable width like 300px or 400px for "Squared-ish" look or use a ratio.
      // Let's try 350px - 1fr - 350px for now to give space for "Square-ish" content.
      viewState === 'FOCUS' && "md:grid-cols-[0px_1fr_0px] xl:grid-cols-[300px_1fr_300px]",
      // State C: ZEN - 0px 1fr 0px
      viewState === 'ZEN' && "md:grid-cols-[0px_1fr_0px]",

      className
    )}>
      {kids.map((child, index) => {
        // Assume strictly 3 children for desktop logic: [Left, Center, Right]
        const column = index === 0 ? 'left' : index === 1 ? 'center' : 'right';
        const isCollapsed = viewState !== 'DASHBOARD' && column !== 'center';
        const isHidden = viewState === 'ZEN' && column !== 'center';

        return cloneElement(child, {
          column,
          isCollapsed,
          className: cn(
            child.props.className,
            "h-full w-full",
            isHidden && "hidden"
          )
        });
      })}
    </div>
  );
};
