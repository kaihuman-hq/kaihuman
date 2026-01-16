import { ComponentChildren, h } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { Tile } from '../Molecules/Tile';
import { StatusBar } from '../Organisms/StatusBar';
import { Editor } from '../Organisms/Editor';
import { MonoText, MonoHeader } from '../Atoms/Typography';
import { MainGrid } from './MainGrid';
import { MillerColumn } from '../Molecules/MillerColumn';
// framer-motion removed

export interface TileDef {
  id: string | number;
  title: string;
  /** Component or element to render when this tile is focused */
  content?: ComponentChildren;
  type?: 'FILE' | 'FOLDER';
}

export interface FileSystemState {
  columns: { items: TileDef[]; activeId: string | null }[];
}

export interface MainAppProps {
  tiles?: TileDef[]; // Legacy/Single-level prop
  fileSystem?: FileSystemState;
  onNavigate?: (path: string[]) => void; // Path is list of IDs
  onItemClick?: (item: TileDef) => void;

  currentRepository?: import('../Organisms/StatusBar').Repository;
  repositories?: import('../Organisms/StatusBar').Repository[];
  onSelectRepository?: (repo: import('../Organisms/StatusBar').Repository) => void;
}

export const MainApp = ({ tiles = defaultTiles, fileSystem, onItemClick, onNavigate, ...props }: MainAppProps) => {
  // State for legacy/single-level mode
  const [activeTileId, setActiveTileId] = useState<string | number | null>(null);

  // If fileSystem is provided, we use the Miller Column Layout
  const isMillerMode = !!fileSystem;

  // For Miller Mode, "Focus" is when the last column has a selected "FILE" item, 
  // OR we can rely on `activeTileId` if we want to "zoom in" on a specific file.
  // The requirements say: "right content of the selected folder is shown".
  // "User can always click on one of the smaller tiles in the left columns".
  // "There should be a way to select the current folder, so all folder content becomes the full matrix".

  // Let's assume `activeTileId` is used for "Focusing a File" (fullscreen editor).

  const activeTile = activeTileId !== null ? (
    isMillerMode
      ? fileSystem?.columns.flatMap(c => c.items).find(t => t.id === activeTileId)
      : tiles.find(t => t.id === activeTileId)
  ) : null;

  // Calculate Breadcrumbs Logic
  const getBreadcrumbs = () => {
    if (activeTileId !== null && !isMillerMode) return ["root", "focus", `tile_${activeTileId}`];

    if (isMillerMode && fileSystem) {
      // Traverse simple path
      const path: string[] = ['~'];
      fileSystem.columns.forEach(col => {
        if (col.activeId) {
          const activeItem = col.items.find(i => i.id === col.activeId);
          if (activeItem) path.push(String(activeItem.title));
        }
      });
      return path;
    }
    return ["~"];
  };

  const handleDashboardClick = () => {
    setActiveTileId(null);
    if (onNavigate) {
      onNavigate([]); // Signal root navigation to parent
    }
  };

  return (
    <div className="h-screen w-full max-w-[100vw] bg-[var(--los-bg)] overflow-hidden relative">
      <MainGrid viewState={activeTileId !== null ? 'FOCUS' : 'DASHBOARD'}>

        {/* CENTER STAGE: The Matrix OR The Active Tile */}
        <Tile title={activeTileId !== null ? `FOCUS: ${activeTileId}` : undefined} column="center">
          {activeTileId === null ? (
            isMillerMode ? (
              // MILLER COLUMNS LAYOUT
              <div className="absolute top-0 left-0 right-0 bottom-8 flex flex-row overflow-x-auto">
                {fileSystem!.columns.map((col, index) => {
                  const isLast = index === fileSystem!.columns.length - 1;
                  return (
                    <MillerColumn
                      key={index}
                      items={col.items}
                      activeId={col.activeId}
                      variant={isLast ? 'GRID' : 'LIST'}
                      onItemClick={(item) => {
                        if (onItemClick) onItemClick(item);
                        if (item.type === 'FILE') setActiveTileId(item.id);
                      }}
                    />
                  )
                })}
              </div>
            ) : (
              // LEGACY SINGLE GRID LAYOUT
              <div
                className={cn(
                  "absolute top-0 left-0 right-0 bottom-8 grid gap-px bg-[var(--los-bg)] overflow-y-auto overflow-x-hidden",
                  "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8",
                  "content-start", // Pack to top
                  "animate-in fade-in duration-300"
                )}
                key="matrix"
              >
                {tiles.map((tile) => (
                  <div
                    key={tile.id}
                    onClick={() => setActiveTileId(tile.id)}
                    className="bg-[var(--los-bg)] ring-1 ring-inset ring-[var(--los-border)] hover:bg-white/5 transition-colors group relative cursor-pointer w-full pb-[100%]"
                  >
                    <div className="absolute inset-0 overflow-hidden p-4 flex flex-col">
                      <div className="flex justify-between items-start shrink-0 mb-2">
                        <MonoText className="text-xs opacity-50 group-hover:opacity-100 transition-opacity flex-1 mr-2 truncate">
                          {tile.title}
                        </MonoText>
                        {tile.type === 'FOLDER' ? (
                          <div className="w-2 h-2 border border-[var(--los-muted)] rotate-45 shrink-0" />
                        ) : (
                          <div className="w-2 h-2 rounded-full border border-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors shrink-0" />
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto min-h-0 w-full mb-2">
                        {tile.content}
                      </div>

                      <div className="text-right shrink-0 mt-auto">
                        <MonoText className="text-[10px] text-[var(--los-muted)]">
                          {`ID: ${tile.id.toString().toUpperCase().slice(0, 4)}`}
                        </MonoText>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // STATE B: FOCUSED TILE
            <FocusedTile
              tile={activeTile!}
              onClose={() => setActiveTileId(null)}
            />
          )}
        </Tile>
      </MainGrid>

      {/* Sticky Status Bar */}
      <StatusBar
        mode={activeTileId !== null ? "FOCUS" : "NORMAL"}
        breadcrumbs={getBreadcrumbs()}
        stats={[
          { label: "TILES", value: tiles.length.toString() },
          { label: "GRID", value: activeTileId ? "OFF" : "AUTO" },
        ]}
        currentRepository={props.currentRepository}
        repositories={props.repositories}
        onSelectRepository={props.onSelectRepository}
        onDashboardClick={handleDashboardClick}
      />
    </div>
  );
};

const FocusedTile = ({ tile, onClose }: { tile: TileDef; onClose: () => void }) => {
  return (
    <div
      className="absolute top-0 left-0 right-0 bottom-8 bg-[var(--los-bg)] z-10 p-8 flex flex-col"
      key={`focused-${tile.id}`}
    >
      <div
        className="flex-1 border border-[var(--los-border)] flex flex-col relative bg-[var(--los-bg)] animate-in fade-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header / Controls */}
        <div className="h-12 border-b border-[var(--los-border)] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4">
            <MonoHeader className="text-[var(--los-accent)]">{`TILE: ${tile.id.toString().toUpperCase().padStart(4, '0')}`}</MonoHeader>
            {/* Note: View Switcher removed as content determines the view now */}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex items-center gap-2 group px-2 py-1 hover:bg-red-500/10 rounded-sm transition-colors"
          >
            <span className="text-[10px] text-[var(--los-muted)] group-hover:text-red-500">[CLOSE]</span>
            <div className="w-2 h-2 rounded-full border border-[var(--los-muted)] group-hover:border-red-500 group-hover:bg-red-500 transition-colors" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-0 relative">
          {tile.content ? tile.content : (
            <div className="p-8 flex items-center justify-center text-[var(--los-muted)]">
              <MonoText>No content defined for this tile.</MonoText>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Default dummy data if none provided
const defaultTiles: TileDef[] = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  title: `Tile 0${i + 1}`,
  content: <div className="p-8"><Editor /></div>
}));
