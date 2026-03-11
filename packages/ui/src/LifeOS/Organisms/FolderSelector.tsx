import { Logger } from '@lifosy/core';
import { Check, ChevronRight, Folder } from 'lucide-preact';
import { useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';

const logger = new Logger('FolderSelector');

export interface FolderItem {
  id: string; // The full path or unique ID
  name: string; // Display name
  hasChildren: boolean;
}

export interface FolderSelectorProps {
  rootItems: FolderItem[];
  /**
   * Async callback to load children for a given folder ID/Path.
   * Should return an empty array if no children.
   */
  onLoadFolder: (path: string) => Promise<FolderItem[]>;
  onSelect: (path: string) => void;
  selectedPath: string; // Currently selected path (e.g. "foo/bar")
  className?: string;
}

interface Column {
  parentId: string | null; // null for root
  items: FolderItem[];
  activeId: string | null; // Which item in this column is active (drilled down)
}

export const FolderSelector = ({
  rootItems,
  onLoadFolder,
  onSelect,
  selectedPath,
  className,
}: FolderSelectorProps) => {
  const [columns, setColumns] = useState<Column[]>([
    { parentId: null, items: rootItems, activeId: null },
  ]);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Initial load logic: if selectedPath is provided, we might want to try to reconstruct the path
  // But since onLoadFolder is async, simple reconstruction is hard without knowing the tree ahead of time.
  // For now, we start at root. If the user wants to pre-expand, that would require more complex logic
  // or passing the full initial tree structure. We'll stick to manual navigation for now unless requested.

  const handleItemClick = async (columnAcc: Column, item: FolderItem, colIndex: number) => {
    // 1. Update selection immediately
    onSelect(item.id);

    // 2. Update active state in current column
    const newColumns = columns.slice(0, colIndex + 1);
    newColumns[colIndex] = { ...columnAcc, activeId: item.id };
    setColumns(newColumns);

    // 3. If has children, try to load them
    if (item.hasChildren) {
      // Check if already loading
      if (loadingIds.has(item.id)) return;

      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });

      try {
        const children = await onLoadFolder(item.id);
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });

        if (children.length > 0) {
          setColumns([...newColumns, { parentId: item.id, items: children, activeId: null }]);
          // Auto-scroll to right
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.scrollTo({
                left: containerRef.current.scrollWidth,
                behavior: 'smooth',
              });
            }
          }, 10);
        }
      } catch (e) {
        logger.error('Failed to load folder', e);
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex overflow-x-auto h-64 border border-[var(--los-border)] bg-[var(--los-bg)]',
        className,
      )}
    >
      {columns.map((col, index) => (
        <div
          key={col.parentId || 'root'}
          className="w-48 shrink-0 border-r border-[var(--los-border)] overflow-y-auto"
        >
          {col.items.length === 0 ? (
            <div className="p-4 text-xs text-[var(--los-muted)] italic">Empty folder</div>
          ) : (
            col.items.map((item) => {
              const isActive = col.activeId === item.id;
              const isSelected = selectedPath === item.id;
              const isLoading = loadingIds.has(item.id);

              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: list item click handler
                // biome-ignore lint/a11y/useKeyWithClickEvents: list item click handler
                <div
                  key={item.id}
                  onClick={() => handleItemClick(col, item, index)}
                  className={cn(
                    'flex items-center justify-between p-2 cursor-pointer text-xs font-mono border-b border-[var(--los-border)]/20 transition-colors hover:bg-white/5',
                    isActive
                      ? 'bg-[var(--los-accent)]/10 text-[var(--los-accent)]'
                      : 'text-[var(--los-muted)]',
                    isSelected && !isActive && 'text-[var(--los-fg)]', // Highlight selected even if drill-down moved past it?
                    // Actually, usually last active IS selected.
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder
                      size={14}
                      className={cn(
                        isActive || isSelected
                          ? 'text-[var(--los-accent)]'
                          : 'text-[var(--los-muted)]',
                      )}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>

                  {isLoading ? (
                    <div className="w-3 h-3 rounded-full border border-[var(--los-muted)] border-t-[var(--los-accent)] animate-spin shrink-0" />
                  ) : (
                    item.hasChildren && (
                      <ChevronRight
                        size={12}
                        className={cn(
                          'shrink-0',
                          isActive ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]/50',
                        )}
                      />
                    )
                  )}

                  {/* Visual indicator for selection if it's the leaf selection */}
                  {isSelected && !item.hasChildren && (
                    <Check size={12} className="text-[var(--los-accent)] shrink-0 ml-1" />
                  )}
                </div>
              );
            })
          )}
        </div>
      ))}
    </div>
  );
};
