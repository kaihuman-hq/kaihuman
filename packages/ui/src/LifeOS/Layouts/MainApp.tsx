import { ComponentChildren, h } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { Tile } from '../Molecules/Tile';
import { StatusBar } from '../Organisms/StatusBar';
import { Editor } from '../Organisms/Editor';
import { MonoText, MonoHeader } from '../Atoms/Typography';
import { MainGrid } from './MainGrid';
// framer-motion removed

export interface TileDef {
  id: string | number;
  title: string;
  /** Component or element to render when this tile is focused */
  content?: ComponentChildren;
}

export interface MainAppProps {
  tiles?: TileDef[];
  currentRepository?: import('../Organisms/StatusBar').Repository;
  repositories?: import('../Organisms/StatusBar').Repository[];
  onSelectRepository?: (repo: import('../Organisms/StatusBar').Repository) => void;
}

export const MainApp = ({ tiles = defaultTiles, ...props }: MainAppProps) => {
  // State
  const [activeTileId, setActiveTileId] = useState<string | number | null>(null);

  const activeTile = activeTileId !== null ? tiles.find(t => t.id === activeTileId) : null;

  return (
    <div className="h-screen w-screen bg-[var(--los-bg)] overflow-hidden relative">
      <MainGrid viewState={activeTileId !== null ? 'FOCUS' : 'DASHBOARD'}>

        {/* CENTER STAGE: The Matrix OR The Active Tile */}
        <Tile title={activeTileId !== null ? `FOCUS: ${activeTileId}` : "MATRIX_ROOT"} column="center">
          {activeTileId === null ? (
            // STATE A: THE MATRIX
            <div
              className={cn(
                "absolute inset-0 grid gap-[1px] bg-[var(--los-border)] border-b border-[var(--los-border)] overflow-y-auto",
                "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8",
                "content-start", // Pack to top
                "animate-in fade-in duration-300"
              )}
              key="matrix"
            >
              {tiles.map((tile) => (
                <div
                  key={tile.id}
                  onClick={() => setActiveTileId(tile.id)}
                  className="bg-[var(--los-bg)] aspect-square hover:bg-white/5 transition-colors group relative cursor-pointer"
                >
                  <div className="p-4 flex flex-col justify-between h-full">
                    <div className="flex justify-between items-start">
                      <MonoText className="text-xs opacity-50 group-hover:opacity-100 transition-opacity">
                        {tile.title}
                      </MonoText>
                      <div className="w-2 h-2 rounded-full border border-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors" />
                    </div>
                    <div className="text-right">
                      <MonoText className="text-[10px] text-[var(--los-muted)]">
                        {`ID: ${tile.id.toString().toUpperCase().padStart(4, '0')}`}
                      </MonoText>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
        breadcrumbs={activeTileId !== null ? ["root", "focus", `tile_${activeTileId}`] : ["root", "dashboard"]}
        stats={[
          { label: "TILES", value: tiles.length.toString() },
          { label: "GRID", value: activeTileId ? "OFF" : "AUTO" },
        ]}
        currentRepository={props.currentRepository}
        repositories={props.repositories}
        onSelectRepository={props.onSelectRepository}
      />
    </div>
  );
};

const FocusedTile = ({ tile, onClose }: { tile: TileDef; onClose: () => void }) => {
  return (
    <div
      className="absolute inset-0 bg-[var(--los-bg)] z-10 p-8 flex flex-col"
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
