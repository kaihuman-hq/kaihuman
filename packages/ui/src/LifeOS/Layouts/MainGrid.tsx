import { ComponentChildren, h, cloneElement, toChildArray, VNode } from 'preact';
import { cn } from '../../utils';
import { Logger } from '@lifosy/core';

const logger = new Logger('MainGrid');

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

  // Identify children by column prop
  const leftChild = kids.find(k => k.props?.column === 'left');
  const rightChild = kids.find(k => k.props?.column === 'right');
  // Center is either explicitly marked, or it's the remaining one if not left/right
  const centerChild = kids.find(k => k.props?.column === 'center')
    || kids.find(k => k.props?.column !== 'left' && k.props?.column !== 'right');

  // Debug
  // logger.debug(`Rendering. viewState: ${JSON.stringify(viewState)}`);
  // logger.debug(`Has Left: ${!!leftChild}, Has Right: ${!!rightChild}`);

  // Helper to determine grid cols
  const leftWidth = leftChild ? "minmax(250px,1fr)" : "0px";
  const rightWidth = rightChild ? "minmax(250px,1fr)" : "0px";

  const dynamicVars = viewState === 'DASHBOARD' ? {
    '--col-left': leftWidth,
    '--col-right': rightWidth
  } : {};

  return (
    <div
      className={cn(
        "life-os-root h-screen w-full max-w-[100vw] bg-[var(--los-bg)] overflow-hidden",
        "grid transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]",
        "grid-cols-1", // Mobile default

        // Desktop (md+)
        viewState === 'DASHBOARD' && "md:grid-cols-[var(--col-left)_minmax(400px,2fr)_var(--col-right)]",
        viewState === 'ZEN' && "md:grid-cols-[0px_1fr_0px]",
        viewState === 'FOCUS' && "md:grid-cols-[0px_1fr_0px] xl:grid-cols-[300px_1fr_300px]",

        className
      )}
      // Use CSS vars to allow media query class overrides work
      style={dynamicVars as any}
    >
      {[leftChild, centerChild, rightChild].map((child, index) => {
        if (!child) return null; // Skip empty slots

        const column = index === 0 ? 'left' : index === 1 ? 'center' : 'right';
        const isCollapsed = viewState !== 'DASHBOARD' && column !== 'center';

        // Dynamic visibility logic
        let isHidden = false;
        if (viewState === 'ZEN' && column !== 'center') isHidden = true;
        // In DASHBOARD, if child exists, it's shown.

        return cloneElement(child, {
          column,
          isCollapsed,
          className: cn(
            child.props.className,
            "h-full w-full",
            isHidden && "hidden",
            // Explicit grid placement
            column === 'left' && "md:col-start-1",
            column === 'center' && "md:col-start-2",
            column === 'right' && "md:col-start-3"
          )
        });
      })}
    </div>
  );
};
