import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { cn } from '../../utils';
import { TileDef } from '../Layouts/MainApp';
import { MonoText } from '../Atoms/Typography';
import { Folder, FileText, MoreVertical, Trash, Edit, Move } from 'lucide-preact';

export interface MillerColumnProps {
  items: TileDef[];
  activeId?: string | null;
  variant: 'GRID' | 'LIST';
  onItemClick: (item: TileDef) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (path: string, newPath: string) => void;
  onMoveFile?: (path: string, newPath: string) => void; // Distinction for UI, same backend
}

export const MillerColumn = ({
  items,
  activeId,
  variant,
  onItemClick,
  onDeleteFile,
  onRenameFile,
  onMoveFile
}: MillerColumnProps) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClick = () => setActiveMenu(null);
    if (activeMenu) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [activeMenu]);

  if (variant === 'GRID') {
    // Current Active View - The Grid
    return (
      <div
        className={cn(
          "grid gap-px bg-[var(--los-bg)] overflow-y-auto overflow-x-hidden flex-1 h-full min-w-0 w-full",
          "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-8",
          "content-start",
          "animate-in fade-in slide-in-from-right-4 duration-300"
        )}
      >
        {items.map((tile) => {
          return (
            <div
              key={tile.id}
              onClick={() => onItemClick(tile)}
              className={cn(
                "ring-1 ring-inset ring-[var(--los-border)] hover:bg-white/5 transition-colors group relative cursor-pointer w-full pb-[50%]",
                tile.type === 'FOLDER' ? "bg-[var(--los-accent)]/5" : "bg-[var(--los-bg)]"
              )}
            >
              <div className="absolute inset-0 overflow-hidden p-3 flex flex-col">
                <div className="flex justify-between items-center shrink-0 mb-1">
                  <MonoText className="text-xs opacity-50 group-hover:opacity-100 transition-opacity truncate flex-1 mr-2">
                    {tile.title}
                  </MonoText>

                  <div className="flex items-center gap-1">
                    {tile.type === 'FOLDER' ? (
                      <Folder size={12} className="text-[var(--los-muted)] group-hover:text-[var(--los-accent)] shrink-0" />
                    ) : (
                      <>
                        {/* Context Menu Trigger */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === tile.id ? null : tile.id.toString());
                          }}
                          className="p-1 hover:bg-white/10 rounded cursor-pointer text-[var(--los-muted)] hover:text-white"
                        >
                          <MoreVertical size={12} />
                        </div>
                        {/* Context Menu */}
                        {activeMenu === tile.id && (
                          <div
                            className="absolute top-8 right-2 z-50 bg-[#1a1a1f] border border-[var(--los-border)] shadow-xl rounded flex flex-col min-w-[120px] py-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div
                              className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(null);
                                const newName = prompt("Rename to:", tile.title);
                                if (newName && newName !== tile.title) {
                                  // Keep dir, change name
                                  const parts = tile.id.toString().split('/');
                                  parts.pop();
                                  const newPath = [...parts, newName].join('/');
                                  onRenameFile?.(tile.id.toString(), newPath);
                                }
                              }}
                            >
                              <Edit size={12} /> Rename
                            </div>
                            <div
                              className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(null);
                                const newPath = prompt("Move to path:", tile.id.toString());
                                if (newPath && newPath !== tile.id.toString()) {
                                  onMoveFile?.(tile.id.toString(), newPath);
                                }
                              }}
                            >
                              <Move size={12} /> Move
                            </div>
                            <div
                              className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs text-red-400 hover:text-red-300"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(null);
                                onDeleteFile?.(tile.id.toString());
                              }}
                            >
                              <Trash size={12} /> Delete
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 w-full mb-1 pointer-events-none opacity-50">
                  {tile.content}
                </div>

                <div className="text-right shrink-0 mt-auto">
                  <MonoText className="text-[10px] text-[var(--los-muted)]">
                    {`ID: ${tile.id.toString().toUpperCase().slice(0, 4)}`}
                  </MonoText>
                </div>
              </div>
            </div>
          );
        })}
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
