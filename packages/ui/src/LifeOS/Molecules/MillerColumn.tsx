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
}

export const MillerColumn = ({
  items,
  activeId,
  variant,
  onItemClick,
  onDeleteFile,
  onRenameFile,
  onRequestMove
}: MillerColumnProps) => {
  const [activeMenu, setActiveMenu] = useState<{ id: string, x: number, y: number } | null>(null);

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

    return createPortal(
      <div
        className="fixed z-[9999] bg-[#1a1a1f] border border-[var(--los-border)] shadow-xl rounded flex flex-col min-w-[120px] py-1 animate-in fade-in zoom-in-95 duration-100"
        style={{ top: activeMenu.y, left: activeMenu.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs"
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
          className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(null);
            onRequestMove?.(tile.id.toString());
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
            "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-8",
            "content-start",
            "animate-in fade-in slide-in-from-right-4 duration-300"
          )}
        >
          {filteredItems.map((tile) => (
            <div
              key={tile.id}
              onClick={() => onItemClick(tile)}
              className={cn(
                "ring-1 ring-inset ring-[var(--los-border)] hover:bg-white/5 transition-colors group relative cursor-pointer w-full pb-[100%] aspect-square flex items-center justify-center",
                tile.type === 'FOLDER' ? "bg-[var(--los-accent)]/5" : "bg-[var(--los-bg)]"
              )}
            >
              <div className="absolute inset-0 overflow-hidden p-6 flex flex-col items-center justify-center text-center">

                {/* Icon (Large) */}
                <div className="mb-4 text-[var(--los-muted)] group-hover:text-[var(--los-accent)] transition-colors">
                  {tile.type === 'FOLDER' ? <Folder size={32} /> : <FileText size={32} />}
                </div>

                {/* Title (Big & Focused) */}
                <MonoText
                  className={cn(
                    "text-sm sm:text-base font-bold truncate w-full px-2",
                    "text-[var(--los-fg)] group-hover:text-[var(--los-accent)] transition-colors"
                  )}
                  title={tile.title}
                >
                  {tile.title}
                </MonoText>

                {/* Menu Trigger (Top Right) */}
                {tile.type === 'FILE' && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      onClick={(e) => handleMenuTrigger(e, tile.id.toString())}
                      className={cn(
                        "p-1 hover:bg-white/10 rounded cursor-pointer transition-colors relative",
                        activeMenu?.id === tile.id ? "text-white bg-white/10 opacity-100" : "text-[var(--los-muted)] hover:text-white"
                      )}
                    >
                      <MoreVertical size={16} />
                    </div>
                  </div>
                )}

                {/* ID Label (Subtle, Bottom) */}
                <div className="absolute bottom-2 text-center w-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <MonoText className="text-[9px] text-[var(--los-muted)] tracking-wider">
                    {tile.id.toString().toUpperCase().slice(0, 4)}
                  </MonoText>
                </div>

              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-full h-32 flex flex-col items-center justify-center text-[var(--los-muted)] gap-2">
              <MonoText>No items found.</MonoText>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs underline hover:text-[var(--los-fg)]">Clear Search</button>
              )}
            </div>
          )}
        </div>
        {renderContextMenu()}
      </div>
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
                "text-xs truncate hidden md:block",
                activeId === tile.id ? "text-[var(--los-fg)] font-bold" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"
              )}>
                {tile.title}
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
