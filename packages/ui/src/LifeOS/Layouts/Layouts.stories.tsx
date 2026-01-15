import type { Meta, StoryObj } from '@storybook/preact';
import { MainGrid } from './MainGrid';
import { MainApp } from './MainApp';
import { Tile } from '../Molecules/Tile';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { StatusBar } from '../Organisms/StatusBar';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';

const meta = {
  title: 'LifeOS/Layouts',
  parameters: {
    backgrounds: { default: 'dark' },
    layout: 'fullscreen'
  }
} satisfies Meta;

export default meta;

// export const BentoLayout: StoryObj = { ... }

export const TileMatrix: StoryObj = {
  render: () => {
    // Local State for the Story
    const [activeTileId, setActiveTileId] = useState<number | null>(null);
    const tiles = Array.from({ length: 24 }, (_, i) => ({ id: i, title: `Tile ${i}` }));

    return (
      <div className="h-screen w-screen bg-[var(--los-bg)] overflow-hidden relative">
        <MainGrid viewState={activeTileId !== null ? 'FOCUS' : 'ZEN'}>

          {/* LEFT SIDE */}
          <Tile title="LEFT" column="left" className="bg-red-900/20">
            <div className="h-full w-full flex items-center justify-center">
              <MonoText className="rotate-[-90deg]">SIDE_A</MonoText>
            </div>
          </Tile>

          {/* CENTER */}
          <Tile title={activeTileId !== null ? `FOCUS: ${activeTileId}` : "MATRIX"} column="center" className="bg-blue-900/20">
            <div className="h-full w-full relative border border-green-500">
              <div className="absolute top-0 right-0 z-50 bg-black text-white p-2">
                DEBUG: ID={activeTileId === null ? 'NULL' : activeTileId}
              </div>
              {/* MATRIX VIEW */}
              <div className={cn(
                "absolute inset-0 grid gap-[1px] bg-[var(--los-border)] border-b border-[var(--los-border)] overflow-y-auto content-start transition-opacity duration-300",
                "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8",
                activeTileId !== null ? "opacity-0 pointer-events-none" : "opacity-100"
              )}>
                {tiles.map((tile) => (
                  <div
                    key={tile.id}
                    onClick={() => setActiveTileId(tile.id)}
                    className="bg-[var(--los-bg)] aspect-square hover:bg-white/5 transition-colors cursor-pointer relative group"
                  >
                    <div className="p-4">
                      <MonoText className="text-xs opacity-50">{tile.title}</MonoText>
                    </div>
                  </div>
                ))}
              </div>

              {/* FOCUSED VIEW */}
              <div className={cn(
                "absolute inset-0 pointer-events-none transition-opacity duration-300",
                activeTileId !== null ? "opacity-100 pointer-events-auto" : "opacity-0"
              )}>
                {activeTileId !== null && (
                  <FocusedTileDemo
                    id={activeTileId}
                    onClose={() => setActiveTileId(null)}
                  />
                )}
              </div>
            </div>
          </Tile>

          {/* RIGHT SIDE: Placeholder for "Squared Tile" */}
          <Tile title="RIGHT" column="right">
            <div className="h-full w-full flex items-center justify-center bg-white/5">
              <MonoText className="rotate-90">SIDE_B</MonoText>
            </div>
          </Tile>

        </MainGrid>

        <StatusBar
          mode={activeTileId !== null ? "FOCUS" : "MATRIX"}
          breadcrumbs={activeTileId !== null ? ["root", "tile", `#${activeTileId}`] : ["root", "matrix"]}
          stats={[{ label: "TILES", value: tiles.length.toString() }]}
        />
      </div>
    );
  }
}

// Local Demo Component for Focused Tile
const FocusedTileDemo = ({ id, onClose }: { id: number; onClose: () => void }) => {
  return (
    <div className="absolute inset-0 bg-[var(--los-bg)] z-10 p-8 flex flex-col">
      <div className="flex-1 border border-[var(--los-border)] flex flex-col relative bg-[var(--los-bg)] animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="h-12 border-b border-[var(--los-border)] flex items-center justify-between px-4">
          <MonoHeader className="text-[var(--los-accent)]">FOCUSED_TILE_{id}</MonoHeader>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-xs hover:text-red-500">[CLOSE]</button>
        </div>
        {/* Content */}
        <div className="flex-1 p-8">
          <MonoText>Here is the focused content with full height and reasonable width.</MonoText>
        </div>
      </div>
    </div>
  );
}

// export const ApplicationShell: StoryObj = { ... }
