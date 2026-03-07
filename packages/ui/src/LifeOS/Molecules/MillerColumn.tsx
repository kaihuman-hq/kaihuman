import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { cn } from '../../utils';
import { TileDef } from '../Layouts/MainApp';
import { MonoText, MonoLabel } from '../Atoms/Typography';
import { Folder, FileText, MoreVertical, Trash, Edit, Move, Search as SearchIcon, X } from 'lucide-preact';

export interface MillerColumnProps {
  items: TileDef[];
  activeId?: string | null;
  variant: 'GRID' | 'LIST';
  onItemClick: (item: TileDef) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (path: string, newPath: string) => void;
  onRequestMove?: (path: string) => void;
  onNewFileClick?: () => void;
  onToggleQuickNote?: (path: string) => void;
  isQuickNote?: (path: string) => boolean;
}

export const MillerColumn = ({
  items,
  activeId,
  variant,
  onItemClick,
  onDeleteFile,
  onRenameFile,
  onRequestMove,
  onNewFileClick,
  onToggleQuickNote,
  isQuickNote
}: MillerColumnProps) => {
  const [activeMenu, setActiveMenu] = useState<{ id: string, x: number, y: number } | null>(null);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);

  // Search State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter items based on search
  const filteredItems = items.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close menu on click outside
  useEffect(() => {
    const handleClick = () => setActiveMenu(null);
    if (activeMenu) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [activeMenu]);

  // Ctrl+F Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (variant === 'GRID') { // Only valid for current view if focused? Or globally if this component is mounted?
          // Since this component is mounted when visualizing files, this should be fine.
          e.preventDefault();
          setShowSearch(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [variant, showSearch]);


  // Shared context menu renderer (using Portal)
  const renderContextMenu = () => {
    if (!activeMenu) return null;
    const tile = items.find(i => i.id.toString() === activeMenu.id);
    if (!tile) return null;

    const ext = tile.extension?.toLowerCase();
    const isMd = ext === '.md';

    return createPortal(
      <div
        className="fixed z-[9999] bg-[#1a1a1f] border border-[var(--los-border)] shadow-xl rounded flex flex-col min-w-[120px] py-1 animate-in fade-in zoom-in-95 duration-100 text-white"
        style={{ top: activeMenu.y, left: activeMenu.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-3 py-2 hover:bg-white/10 flex items-center gap-2 cursor-pointer text-xs transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(null);
            const newName = prompt("Rename to:", tile.title);
            if (newName && newName !== tile.title) {
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
          className="px-3 py-2 hover:bg-white/10 flex items-center gap-2 cursor-pointer text-xs transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(null);
            onRequestMove?.(tile.id.toString());
          }}
        >
          <Move size={12} /> Move
        </div>
        {isMd && onToggleQuickNote && isQuickNote && (
          <div
            className="px-3 py-2 hover:bg-white/10 flex items-center gap-2 cursor-pointer text-xs transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(null);
              onToggleQuickNote(tile.id.toString());
            }}
          >
            <FileText size={12} /> {isQuickNote(tile.id.toString()) ? 'Remove Quick Note' : 'Add Quick Note'}
          </div>
        )}
        <div
          className="px-3 py-2 hover:bg-red-500/20 flex items-center gap-2 cursor-pointer text-xs text-red-400 hover:text-red-300 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(null);
            onDeleteFile?.(tile.id.toString());
          }}
        >
          <Trash size={12} /> Delete
        </div>
      </div>,
      document.body
    );
  };

  const handleMenuTrigger = (e: any, id: string) => {
    e.stopPropagation();
    if (activeMenu?.id === id) {
      setActiveMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenu({ id, x: rect.left, y: rect.bottom + 5 });
  };

  if (variant === 'GRID') {
    return (
      <div className="flex flex-col flex-1 h-full min-w-0 w-full relative">
        {/* Search Bar - conditionally shown */}
        {showSearch && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="bg-[var(--los-bg)] border border-[var(--los-accent)] shadow-[0_0_15px_rgba(var(--los-accent-rgb),0.2)] rounded-full flex items-center px-4 py-2 gap-2">
              <SearchIcon size={16} className="text-[var(--los-accent)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                placeholder="Filter..."
                className="bg-transparent border-none outline-none text-sm text-[var(--los-fg)] flex-1 placeholder:text-[var(--los-muted)]"
              />
              <button onClick={() => { setSearchQuery(''); setShowSearch(false); }} className="hover:text-[var(--los-accent)]">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <div
          className={cn(
            "grid gap-px bg-[var(--los-bg)] overflow-y-auto overflow-x-hidden flex-1",
            "content-start",
            "animate-in fade-in slide-in-from-right-4 duration-300"
          )}
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}
        >
          {filteredItems.map((tile) => {
            const isHovered = hoveredTileId === tile.id.toString();
            const isMenuOpen = activeMenu?.id === tile.id.toString();
            const showMenu = isHovered || isMenuOpen;

            // Extract extension for display
            const ext = tile.extension ? tile.extension.replace('.', '').toUpperCase() : (tile.type === 'FOLDER' ? 'DIR' : 'FILE');


            return (
              <div
                key={tile.id}
                onClick={() => onItemClick(tile)}
                onMouseEnter={() => setHoveredTileId(tile.id.toString())}
                onMouseLeave={() => setHoveredTileId(null)}
                className={cn(
                  "ring-1 ring-inset ring-[var(--los-border)] transition-colors group relative cursor-pointer w-full pb-[100%] aspect-square flex items-center justify-center",
                  isHovered ? "bg-white/10" : (tile.type === 'FOLDER' ? "bg-[var(--los-accent)]/5" : "bg-[var(--los-bg)]")
                )}
                title={tile.id.toString()} // Show full path on hover tooltip
              >
                <div className="absolute inset-0 overflow-hidden p-6 flex flex-col items-center justify-center text-center">

                  {/* Icon (Large) */}
                  <div className="mb-4 text-[var(--los-muted)] group-hover:text-[var(--los-accent)] transition-colors">
                    {tile.type === 'FOLDER' ? <Folder size={32} /> : <FileText size={32} />}
                  </div>

                  {/* Title (Big & Focused) */}
                  <MonoText
                    className={cn(
                      "text-sm sm:text-base font-bold truncate w-full px-2 flex justify-center",
                      "text-[var(--los-fg)] group-hover:text-[var(--los-accent)] transition-colors"
                    )}
                  // title={tile.title} // handled by parent div now
                  >
                    {(() => {
                      if (!tile.title) return null;
                      const lastSlashIdx = tile.title.lastIndexOf('/');
                      const dirPart = lastSlashIdx !== -1 ? tile.title.slice(0, lastSlashIdx + 1) : '';
                      const baseWithExt = lastSlashIdx !== -1 ? tile.title.slice(lastSlashIdx + 1) : tile.title;
                      
                      const firstDotIdx = baseWithExt.indexOf('.');
                      const namePart = firstDotIdx !== -1 ? baseWithExt.slice(0, firstDotIdx) : baseWithExt;
                      const extPart = firstDotIdx !== -1 ? baseWithExt.slice(firstDotIdx) : '';

                      return (
                        <span className="truncate">
                          {dirPart && <span className="text-[var(--los-muted)] font-normal">{dirPart}</span>}
                          <span className="text-[var(--los-fg)] group-hover:text-[var(--los-accent)]">{namePart}</span>
                          {extPart && <span className="text-[var(--los-muted)] font-normal">{extPart}</span>}
                        </span>
                      );
                    })()}
                  </MonoText>

                  {/* Menu Trigger (Top Right) */}
                  {tile.type === 'FILE' && showMenu && (
                    <div className="absolute top-2 right-2 z-[100] animate-in fade-in duration-200">
                      <div
                        onClick={(e) => handleMenuTrigger(e, tile.id.toString())}
                        className={cn(
                          "p-1.5 rounded-md cursor-pointer transition-all duration-200 relative",
                          "bg-black/60 backdrop-blur-md shadow-sm border border-white/20",
                          "text-white hover:bg-[var(--los-accent)] hover:border-[var(--los-accent)] hover:scale-110",
                          isMenuOpen && "bg-[var(--los-accent)] border-[var(--los-accent)] opacity-100"
                        )}
                        title="File Options"
                      >
                        <MoreVertical size={16} />
                      </div>
                    </div>
                  )}

                  {/* Info Overlay (Bottom) */}
                  {isHovered && (
                    <div className="absolute bottom-2 text-center w-full animate-in fade-in duration-200 pointer-events-none">
                      <MonoText className="text-[10px] text-[var(--los-muted)] tracking-wider bg-black/50 px-2 py-0.5 rounded-full inline-block">
                        {ext}
                      </MonoText>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 && (
            <div className="col-span-full h-32 flex flex-col items-center justify-center text-[var(--los-muted)] gap-2">
              <MonoText>No items found.</MonoText>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs underline hover:text-[var(--los-fg)]">Clear Search</button>
              )}
            </div>
          )}


          {/* Add New File Tile */}
          <div
            onClick={(e) => { e.stopPropagation(); onNewFileClick?.(); }}
            className={cn(
              "ring-1 ring-inset ring-[var(--los-border)] transition-colors group relative cursor-pointer w-full pb-[100%] aspect-square flex items-center justify-center",
              "bg-[var(--los-bg)] hover:bg-white/5 border-dashed border-2 border-[var(--los-border)] hover:border-[var(--los-accent)]"
            )}
            title="Create New File"
          >
            <div className="absolute inset-0 overflow-hidden p-6 flex flex-col items-center justify-center text-center">
              <div className="text-[var(--los-muted)] group-hover:text-[var(--los-accent)] transition-colors">
                {/* Plus Icon logic inline or imported */}
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <MonoText className="text-[var(--los-muted)] group-hover:text-[var(--los-accent)] mt-4 font-bold">NEW FILE</MonoText>
            </div>
          </div>
        </div>
        {renderContextMenu()}
      </div >
    );
  }

  // LIST view - unchanged logic but uses filteredItems? 
  // User req was: "This view the shortcut ctrl+f must open a search input... within the current folder".
  // Assuming list view also benefits from filtering? "Make sure this is only affecting the files view!"
  // This layout IS the files view.
  return (
    <>
      {/* Search Bar for List View too? */}
      {showSearch && (
        <div className="absolute top-4 left-16 z-50 w-64 px-4 animate-in slide-in-from-left-2 fade-in duration-200">
          <div className="bg-[var(--los-bg)] border border-[var(--los-accent)] shadow-xl rounded-full flex items-center px-4 py-2 gap-2">
            <SearchIcon size={14} className="text-[var(--los-accent)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Filter..."
              className="bg-transparent border-none outline-none text-xs text-[var(--los-fg)] flex-1 placeholder:text-[var(--los-muted)] min-w-0"
            />
            <button onClick={() => { setSearchQuery(''); setShowSearch(false); }} className="hover:text-[var(--los-accent)]">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="w-16 md:w-48 lg:w-64 border-r border-[var(--los-border)] h-full overflow-y-auto shrink-0 flex flex-col bg-[var(--los-bg)] animate-in fade-in slide-in-from-left-4 duration-300 relative">
        {filteredItems.map((tile) => (
          <div
            key={tile.id}
            onClick={() => onItemClick(tile)}
            className={cn(
              "p-3 border-b border-[var(--los-border)] cursor-pointer transition-all group flex items-center justify-between gap-2 relative",
              activeId === tile.id
                ? "bg-[var(--los-accent-dim)] border-l-2 border-l-[var(--los-accent)]"
                : "hover:bg-white/5 border-l-2 border-l-transparent"
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden flex-1">
              {tile.type === 'FOLDER' ? (
                <Folder size={14} className={cn(activeId === tile.id ? "text-[var(--los-accent)]" : "text-[var(--los-muted)]")} />
              ) : (
                <FileText size={14} className="text-[var(--los-muted)]" />
              )}

              <MonoText className={cn(
                "text-xs truncate hidden md:flex",
                activeId === tile.id ? "text-[var(--los-fg)] font-bold" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"
              )}>
                {(() => {
                  if (!tile.title) return null;
                  const lastSlashIdx = tile.title.lastIndexOf('/');
                  const dirPart = lastSlashIdx !== -1 ? tile.title.slice(0, lastSlashIdx + 1) : '';
                  const baseWithExt = lastSlashIdx !== -1 ? tile.title.slice(lastSlashIdx + 1) : tile.title;
                  
                  const firstDotIdx = baseWithExt.indexOf('.');
                  const namePart = firstDotIdx !== -1 ? baseWithExt.slice(0, firstDotIdx) : baseWithExt;
                  const extPart = firstDotIdx !== -1 ? baseWithExt.slice(firstDotIdx) : '';

                  return (
                    <span className="truncate">
                      {dirPart && <span className="text-[var(--los-muted)] opacity-70">{dirPart}</span>}
                      <span className={cn(
                        "font-bold",
                        activeId === tile.id ? "text-[var(--los-fg)]" : "text-[var(--los-fg)] opacity-90"
                      )}>{namePart}</span>
                      {extPart && <span className="text-[var(--los-muted)] opacity-70">{extPart}</span>}
                    </span>
                  );
                })()}
              </MonoText>
            </div>

            {tile.type === 'FILE' && (
              <div className="relative shrink-0">
                <div
                  onClick={(e) => handleMenuTrigger(e, tile.id.toString())}
                  className={cn(
                    "p-1 rounded cursor-pointer hover:bg-white/10",
                    activeId === tile.id || activeMenu?.id === tile.id ? "text-[var(--los-fg)]" : "text-[var(--los-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                  )}
                >
                  <MoreVertical size={12} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {renderContextMenu()}
    </>
  );
};
