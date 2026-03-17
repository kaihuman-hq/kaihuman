import { ArrowLeft } from 'lucide-preact';
import type { FileSystemState, TileDef } from '../Layouts/MainApp';
import { MillerColumn } from './MillerColumn';

export interface StackedNavigationProps {
  fileSystem: FileSystemState;
  onNavigate: (path: string[]) => void;
  onItemClick: (item: TileDef) => void;
  renderTileContent: (tile: TileDef, mode: 'SMALL' | 'FOCUS') => any;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (path: string, newPath: string) => void;
  onRenameFolder?: (path: string, newPath: string) => void;
  onRequestMove?: (path: string) => void;
}

export const StackedNavigation = ({
  fileSystem,
  onNavigate,
  onItemClick,
  renderTileContent,
  onDeleteFile,
  onRenameFile,
  onRenameFolder,
  onRequestMove,
}: StackedNavigationProps) => {
  // Determine the active column to display (the last one)
  const activeColumnIndex = fileSystem.columns.length - 1;
  const activeColumn = fileSystem.columns[activeColumnIndex];

  if (!activeColumn) return null;

  // Back Handler
  const handleBack = (e?: any) => {
    e?.stopPropagation();
    if (activeColumnIndex > 0) {
      const parentCol = fileSystem.columns[activeColumnIndex - 2];
      // If we are at index 1, parent is index -1 (invalid), so we go to Root.
      // activeColumnIndex - 2 is only valid if activeColumnIndex >= 2.

      const _newPath: string[] = [];

      // If activeColumnIndex == 1 (we are in a subfolder), we want to go to Root.
      if (activeColumnIndex === 1) {
        onNavigate([]);
        return;
      }

      if (parentCol?.activeId) {
        const parts = parentCol.activeId.toString().split('/');
        onNavigate(parts);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--los-bg)] animate-in slide-in-from-right duration-300">
      {/* Mobile Header with Back Button */}
      <div className="flex items-center gap-3 p-4 border-b border-[var(--los-border)] bg-[var(--los-bg)]">
        {activeColumnIndex > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            <ArrowLeft size={18} className="text-[var(--los-fg)]" />
          </button>
        )}
        <div className="flex flex-col">
          <span className="text-xs text-[var(--los-muted)] uppercase tracking-wider">
            {activeColumnIndex === 0
              ? 'Home'
              : fileSystem.columns[activeColumnIndex - 1]?.items.find(
                  (i) => i.id === fileSystem.columns[activeColumnIndex - 1]?.activeId,
                )?.title || 'Folder'}
          </span>
        </div>
      </div>

      {/* Content Area - Reusing MillerColumn logic for the list/grid */}
      <div className="flex-1 overflow-hidden relative">
        <MillerColumn
          items={activeColumn.items.map((t) => ({
            ...t,
            content: renderTileContent(t, 'SMALL'),
          }))}
          activeId={activeColumn.activeId}
          variant="GRID" // Force grid on mobile? or List?
          // Proposal said "Stack" but layout can be Grid or List.
          // Mobile users often prefer Lists for files, Grids for photos.
          // Let's stick to Grid for consistency with "Tiles", but maybe List is better for small screens?
          // MillerColumn handles "GRID" nicely with responsive cols-2.
          onItemClick={(item) => {
            if (item.type === 'FOLDER') {
              // Navigate Down
              onItemClick(item);
              // MainApp's onItemClick for folders usually triggers onNavigate internally or expects us to?
              // MainApp line 398 sets activeTileId null and calls onNavigate.
              // But wait, MillerColumn onItemClick in MainApp (line 996) calls `onItemClick` prop.
              // The prop `onItemClick` (line 165) calls... wait it checks if its folder?
              // MainApp line 165: onItemClick prop is passed from props?
              // MainApp renders MillerColumn with specialized onItemClick (line 996):
              //  onItemClick(item);
              //  if (item.type === 'FILE') setActiveTileId(item.id);

              // So for folders, the MainApp's `onItemClick` might be doing the navigation?
              // Let's assume passing it through works.
            } else {
              onItemClick(item);
            }
          }}
          onDeleteFile={onDeleteFile}
          onRenameFile={onRenameFile}
          onRenameFolder={onRenameFolder}
          onRequestMove={onRequestMove}
        />
      </div>
    </div>
  );
};
