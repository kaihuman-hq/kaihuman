import { h } from 'preact';
import { cn } from '../../utils';
import { TileDef } from '../Layouts/MainApp';
import { MonoText } from '../Atoms/Typography';
import { Folder, FileText } from 'lucide-preact';

export interface MillerColumnProps {
  items: TileDef[];
  activeId?: string | null;
  variant: 'GRID' | 'LIST';
  onItemClick: (item: TileDef) => void;
}

export const MillerColumn = ({ items, activeId, variant, onItemClick }: MillerColumnProps) => {
  if (variant === 'GRID') {
    // Current Active View - The Grid
    return (
      <div
        className={cn(
          "grid gap-[1px] bg-[var(--los-border)] border-b border-[var(--los-border)] overflow-y-auto overflow-x-hidden flex-1 h-full min-w-0 w-full",
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8",
          "content-start",
          "animate-in fade-in slide-in-from-right-4 duration-300"
        )}
      >
        {items.map((tile) => (
          <div
            key={tile.id}
            onClick={() => onItemClick(tile)}
            className="bg-[var(--los-bg)] aspect-square hover:bg-white/5 transition-colors group relative cursor-pointer overflow-hidden"
          >
            <div className="p-4 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start overflow-hidden">
                <MonoText className="text-xs opacity-50 group-hover:opacity-100 transition-opacity truncate w-full">
                  {tile.title}
                </MonoText>
                {tile.type === 'FOLDER' ? (
                  <Folder size={12} className="text-[var(--los-muted)] group-hover:text-[var(--los-accent)]" />
                ) : (
                  <div className="w-2 h-2 rounded-full border border-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors" />
                )}
              </div>
              <div className="text-right">
                <MonoText className="text-[10px] text-[var(--los-muted)]">
                  {`ID: ${tile.id.toString().toUpperCase().slice(0, 4)}`}
                </MonoText>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // History/Previous View - The List/Column
  return (
    <div className="w-16 md:w-48 lg:w-64 border-r border-[var(--los-border)] h-full overflow-y-auto shrink-0 flex flex-col bg-[var(--los-bg)] animate-in fade-in slide-in-from-left-4 duration-300">
      {items.map((tile) => (
        <div
          key={tile.id}
          onClick={() => onItemClick(tile)}
          className={cn(
            "p-3 border-b border-[var(--los-border)] cursor-pointer transition-all group flex items-center gap-2",
            activeId === tile.id
              ? "bg-[var(--los-accent-dim)] border-l-2 border-l-[var(--los-accent)]"
              : "hover:bg-white/5 border-l-2 border-l-transparent"
          )}
        >
          {tile.type === 'FOLDER' ? (
            <Folder size={14} className={cn(activeId === tile.id ? "text-[var(--los-accent)]" : "text-[var(--los-muted)]")} />
          ) : (
            <FileText size={14} className="text-[var(--los-muted)]" />
          )}

          <MonoText className={cn(
            "text-xs truncate hidden md:block",
            activeId === tile.id ? "text-[var(--los-fg)] font-bold" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"
          )}>
            {tile.title}
          </MonoText>
        </div>
      ))}
    </div>
  );
};
