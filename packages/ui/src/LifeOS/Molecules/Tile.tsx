import { ComponentChildren, h } from 'preact';
import { cn } from '../../utils';
import { MonoText } from '../Atoms/Typography';

export interface TileProps {
  title: string;
  children: ComponentChildren;
  column?: 'left' | 'center' | 'right';
  isCollapsed?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Tile = ({
  title,
  children,
  column = 'center',
  isCollapsed = false,
  className,
  onClick
}: TileProps) => {
  return (
    <div className={cn(
      "relative flex flex-col h-full bg-[var(--los-bg)] transition-all duration-300 overflow-hidden",
      // Gapless Border Logic
      "border border-[var(--los-border)]", // Base border
      // Prevent double borders by removing specific sides based on column
      // Left: Keep all (or maybe remove right?)
      // Center: Remove Left (shares with Left's right)
      column === 'center' && "border-l-0",
      // Right: Remove Left (shares with Center's right)
      column === 'right' && "border-l-0",

      className
    )}
      onClick={onClick}
    >
      {/* Micro Header */}
      <div className={cn(
        "h-[24px] shrink-0 flex items-center px-2 bg-[var(--los-bg)] select-none transition-all duration-300",
        "border-b border-[var(--los-border)]",
        isCollapsed && "justify-center px-0 bg-[var(--los-bg)]"
      )}>
        <MonoText className={cn(
          "text-[10px] uppercase tracking-widest truncate transition-opacity duration-200",
          isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100"
        )}>
          {title}
        </MonoText>

        {/* Collapsed Indicator (Vertical Text or Dot) */}
        {isCollapsed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1 h-1 bg-[var(--los-accent)] rounded-full animate-pulse" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 overflow-auto transition-opacity duration-300 relative",
        isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
      )}>
        {children}
      </div>
    </div>
  )
}
