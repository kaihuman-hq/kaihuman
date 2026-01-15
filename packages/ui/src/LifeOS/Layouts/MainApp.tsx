import { h } from 'preact';
import { cn } from '../../utils';
import { Tile } from '../Molecules/Tile';
import { StatusBar } from '../Organisms/StatusBar';
import { MonoText } from '../Atoms/Typography';

export const MainApp = () => {
  // Dummy Data for the Matrix
  const tiles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    title: `Tile 0${i + 1}`,
    type: i === 0 ? 'large' : 'standard'
  }));

  return (
    <div className="min-h-screen bg-[var(--los-bg)] start-0 flex flex-col relative pb-[var(--los-status-height)]">
      {/* 
                Main Content Area (The Matrix) 
                - Uses the gapless grid trick
            */}
      <div className={cn(
        "grid gap-[1px] bg-[var(--los-border)] border-b border-[var(--los-border)]",
        // Responsive Columns
        "grid-cols-1",         // Mobile
        "sm:grid-cols-2",      // Tablet
        "lg:grid-cols-4",      // Desktop
        "xl:grid-cols-6",      // Wide
        "2xl:grid-cols-8"      // Ultra
      )}>
        {tiles.map((tile) => (
          <Tile
            key={tile.id}
            title={tile.title}
            className="border-none aspect-square hover:bg-white/5 transition-colors group"
          >
            <div className="p-4 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start">
                <MonoText className="text-xs opacity-50 group-hover:opacity-100 transition-opacity">
                  {tile.id === 0 ? "HOME_ROOT" : "FILE_NODE"}
                </MonoText>
                <div className="w-2 h-2 rounded-full border border-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors" />
              </div>

              <div className="text-right">
                <MonoText className="text-[10px] text-[var(--los-muted)]">
                  {`ID: ${tile.id.toString(16).toUpperCase().padStart(4, '0')}`}
                </MonoText>
              </div>
            </div>
          </Tile>
        ))}
      </div>

      {/* Sticky Status Bar */}
      <StatusBar
        mode="NORMAL"
        breadcrumbs={["root", "dashboard", "matrix"]}
        stats={[
          { label: "TILES", value: tiles.length.toString() },
          { label: "GRID", value: "AUTO" },
          { label: "MEM", value: "42%" }
        ]}
      />
    </div>
  );
};
