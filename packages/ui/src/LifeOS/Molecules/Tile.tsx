import type { ComponentChildren } from 'preact';
import { cn } from '../../utils';
import { MonoText } from '../Atoms/Typography';

export interface TileProps {
  title?: string;
  children: ComponentChildren;
  column?: 'left' | 'center' | 'right';
  isCollapsed?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'FILE' | 'FOLDER';
}

export const Tile = ({
  title,
  children,
  column: _column = 'center',
  isCollapsed = false,
  className,
  onClick,
  type = 'FILE',
}: TileProps) => {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tile click handler
    // biome-ignore lint/a11y/useKeyWithClickEvents: tile click handler
    <div
      onClick={onClick}
      className={cn(
        'relative flex flex-col h-full overflow-hidden glass-tile rounded-xl mx-1 my-1',
        // "border border-[var(--los-border)]", // Removed in favor of glass-tile
        // column === 'center' && "border-l-0", // Legacy
        // column === 'right' && "border-l-0", // Legacy
        className,
      )}
    >
      {/* Micro Header - Only render if title is provided */}
      {title && (
        <div
          className={cn(
            'h-[24px] shrink-0 flex items-center px-2 bg-[var(--los-bg)] select-none transition-all duration-300',
            'border-b border-[var(--los-border)]',
            isCollapsed && 'justify-center px-0 bg-[var(--los-bg)]',
          )}
        >
          <MonoText
            className={cn(
              'text-[10px] uppercase tracking-widest truncate transition-opacity duration-200 flex',
              isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100',
            )}
          >
            {(() => {
              if (!title) return null;
              const lastSlashIdx = title.lastIndexOf('/');
              const dirPart = lastSlashIdx !== -1 ? title.slice(0, lastSlashIdx + 1) : '';
              const baseWithExt = lastSlashIdx !== -1 ? title.slice(lastSlashIdx + 1) : title;

              const firstDotIdx = baseWithExt.indexOf('.');
              const namePart = firstDotIdx !== -1 ? baseWithExt.slice(0, firstDotIdx) : baseWithExt;
              const extPart = firstDotIdx !== -1 ? baseWithExt.slice(firstDotIdx) : '';

              return (
                <span className="truncate">
                  {dirPart && <span className="text-[var(--los-muted)]">{dirPart}</span>}
                  <span className="text-[var(--los-fg)] font-bold">{namePart}</span>
                  {extPart && <span className="text-[var(--los-muted)]">{extPart}</span>}
                </span>
              );
            })()}
          </MonoText>

          {/* Collapsed Indicator */}
          {isCollapsed && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-[var(--los-accent)] rounded-full animate-pulse" />
            </div>
          )}
          {type === 'FOLDER' && !isCollapsed && (
            <div className="ml-auto w-2 h-2 border border-[var(--los-muted)] rotate-45" />
          )}
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          'flex-1 overflow-auto transition-opacity duration-300 relative',
          isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100',
        )}
      >
        {children}
      </div>
    </div>
  );
};
