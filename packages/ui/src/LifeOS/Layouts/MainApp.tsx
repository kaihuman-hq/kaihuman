import { h } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { Tile } from '../Molecules/Tile';
import { StatusBar } from '../Organisms/StatusBar';
import { Editor } from '../Organisms/Editor';
import { MonoText, MonoHeader } from '../Atoms/Typography';
import { MainGrid } from './MainGrid';
// framer-motion removed

export const MainApp = () => {
  // State
  const [activeTileId, setActiveTileId] = useState<number | null>(null);

  // Dummy Data
  const tiles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    title: `Tile 0${i + 1}`,
    type: i === 0 ? 'large' : 'standard'
  }));

  return (
    <div className="h-screen w-screen bg-[var(--los-bg)] overflow-hidden relative">
      <MainGrid viewState={activeTileId !== null ? 'FOCUS' : 'ZEN'}>

        {/* LEFT SIDEBAR: Navigation / File Tree */}
        <Tile title="NAV" column="left">
          <div className="p-4 space-y-2">
            <MonoHeader>Files</MonoHeader>
            {['src', 'components', 'styles', 'hooks'].map((folder) => (
              <div key={folder} className="text-xs text-[var(--los-muted)] hover:text-[var(--los-fg)] cursor-pointer">
                / {folder}
              </div>
            ))}
          </div>
        </Tile>

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
                        {tile.id === 0 ? "HOME_ROOT" : "NODE"}
                      </MonoText>
                      <div className="w-2 h-2 rounded-full border border-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors" />
                    </div>
                    <div className="text-right">
                      <MonoText className="text-[10px] text-[var(--los-muted)]">
                        {`ID: ${tile.id.toString(16).toUpperCase().padStart(4, '0')}`}
                      </MonoText>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // STATE B: FOCUSED TILE
            <FocusedTile
              id={activeTileId}
              onClose={() => setActiveTileId(null)}
            />
          )}
        </Tile>

        {/* RIGHT SIDEBAR: Widgets */}
        <Tile title="WIDGETS" column="right">
          <div className="p-4 space-y-4">
            <div className="border border-[var(--los-border)] p-2">
              <MonoText className="text-[10px] mb-1">CPU</MonoText>
              <div className="h-1 bg-[var(--los-border)] overflow-hidden">
                <div className="h-full w-[42%] bg-[var(--los-accent)]" />
              </div>
            </div>
            <div className="border border-[var(--los-border)] p-2">
              <MonoText className="text-[10px] mb-1">MEM</MonoText>
              <div className="h-1 bg-[var(--los-border)] overflow-hidden">
                <div className="h-full w-[68%] bg-[var(--los-accent)]" />
              </div>
            </div>
          </div>
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
      />
    </div>
  );
};

const FocusedTile = ({ id, onClose }: { id: number; onClose: () => void }) => {
  const [view, setView] = useState<'INFO' | 'EDITOR'>('INFO');

  return (
    <div
      className="absolute inset-0 bg-[var(--los-bg)] z-10 p-8 flex flex-col"
      key={`focused-${id}`}
    >
      <div
        className="flex-1 border border-[var(--los-border)] flex flex-col relative bg-[var(--los-bg)] animate-in fade-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header / Controls */}
        <div className="h-12 border-b border-[var(--los-border)] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4">
            <MonoHeader className="text-[var(--los-accent)]">{`TILE: ${id?.toString(16).toUpperCase().padStart(4, '0')}`}</MonoHeader>

            {/* View Switcher */}
            <div className="flex border border-[var(--los-border)] rounded-sm overflow-hidden">
              <button
                onClick={() => setView('INFO')}
                className={cn(
                  "px-3 py-1 text-[10px] uppercase hover:bg-[var(--los-accent-dim)] transition-colors",
                  view === 'INFO' ? "bg-[var(--los-accent)] text-black font-bold" : "text-[var(--los-muted)]"
                )}
              >
                Info
              </button>
              <div className="w-[1px] bg-[var(--los-border)]" />
              <button
                onClick={() => setView('EDITOR')}
                className={cn(
                  "px-3 py-1 text-[10px] uppercase hover:bg-[var(--los-accent-dim)] transition-colors",
                  view === 'EDITOR' ? "bg-[var(--los-accent)] text-black font-bold" : "text-[var(--los-muted)]"
                )}
              >
                Editor
              </button>
            </div>
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
        <div className="flex-1 overflow-auto p-8 relative">
          {view === 'INFO' ? (
            <div
              key="info"
              className="max-w-3xl animate-in fade-in slide-in-from-left-4 duration-200"
            >
              <MonoText className="text-xl opacity-80 leading-relaxed mb-6">
                You are viewing the info panel. This is the default view.
              </MonoText>
              <div className="grid grid-cols-3 gap-4">
                <div className="aspect-video border border-[var(--los-border)] bg-white/5 p-4 flex items-end">
                  <MonoText className="text-[10px]">PREVIEW_A</MonoText>
                </div>
                <div className="aspect-video border border-[var(--los-border)] bg-white/5 p-4 flex items-end">
                  <MonoText className="text-[10px]">PREVIEW_B</MonoText>
                </div>
                <div className="aspect-video border border-[var(--los-border)] bg-white/5 p-4 flex items-end">
                  <MonoText className="text-[10px]">METRICS</MonoText>
                </div>
              </div>
            </div>
          ) : (
            <div
              key="editor"
              className="h-full w-full border border-[var(--los-border)] animate-in fade-in slide-in-from-right-4 duration-200"
            >
              <Editor />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
