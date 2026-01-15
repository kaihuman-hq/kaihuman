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

export const BentoLayout: StoryObj = {
  render: () => {
    const [state, setState] = useState<'DASHBOARD' | 'FOCUS' | 'ZEN'>('DASHBOARD');

    return (
      <div className="h-screen w-full relative">
        <MainGrid viewState={state}>
          <Tile title="Sidebar">
            <div className="p-4">
              <MonoHeader>NAV</MonoHeader>
              <MonoText>Projects</MonoText>
            </div>
          </Tile>

          <Tile title="Main Stage" onClick={() => {
            if (state === 'DASHBOARD') setState('FOCUS');
            else if (state === 'FOCUS') setState('ZEN');
            else setState('DASHBOARD');
          }}>
            <div className="p-4 cursor-pointer">
              <MonoHeader>WORK AREA</MonoHeader>
              <MonoText className="mt-4">
                Current State: <span className="text-[var(--los-accent)]">{state}</span>
              </MonoText>
              <MonoText className="mt-2 text-xs">Click me to cycle view modes.</MonoText>
            </div>
          </Tile>

          <Tile title="Widgets">
            <div className="p-4">
              <MonoHeader>INFO</MonoHeader>
              <MonoText>CPU: 12%</MonoText>
            </div>
          </Tile>
        </MainGrid>

        {/* Controls Overlay for Storybook */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2 z-50">
          {['DASHBOARD', 'FOCUS', 'ZEN'].map((s) => (
            <button
              key={s}
              onClick={() => setState(s as any)}
              className={cn(
                "px-3 py-1 text-xs border border-[var(--los-border)] bg-black text-[var(--los-fg)] hover:border-[var(--los-accent)] transition-colors",
                state === s && "bg-[var(--los-accent)] text-black font-bold"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }
}

export const TileMatrix: StoryObj = {
  render: () => {
    const tiles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      title: `Tile 0${i + 1}`
    }));

    return (
      <div className="min-h-screen bg-[var(--los-bg)] start-0">
        {/* 
                   Gapless Grid Trick:
                   - Set grid gap to 1px.
                   - Set grid background to border color.
                   - Set tiles to have NO border.
                   - Result: The gap becomes the border.
                */}
        <div className={cn(
          "grid gap-[1px] bg-[var(--los-border)] border border-[var(--los-border)]",
          // Mobile: 1 column
          "grid-cols-1",
          // Tablet: 2 columns
          "sm:grid-cols-2",
          // Regular Desktop: 4 columns
          "lg:grid-cols-4",
          // Large Screens: 8 columns
          "2xl:grid-cols-8"
        )}>
          {tiles.map((tile) => (
            <Tile
              key={tile.id}
              title={tile.title}
              // Remove default Tile borders to let the grid gap handle it
              className="border-none aspect-square hover:bg-white/5 transition-colors"
            >
              <div className="p-4 flex flex-col justify-between h-full">
                <MonoText className="text-xs opacity-50">Content Block</MonoText>
                <div className="text-right">
                  <MonoText className="text-[10px]">{`ID: ${tile.id}`}</MonoText>
                </div>
              </div>
            </Tile>
          ))}
        </div>

        {/* Sticky Status Bar */}
        <StatusBar
          mode="NORMAL"
          breadcrumbs={["~", "personal", "journal", "2024"]}
          stats={[
            { label: "W/C", value: "1,204" },
            { label: "SYNC", value: "OK" }
          ]}
        />
      </div>
    );
  }
}

export const ApplicationShell: StoryObj = {
  render: () => <MainApp />
}
