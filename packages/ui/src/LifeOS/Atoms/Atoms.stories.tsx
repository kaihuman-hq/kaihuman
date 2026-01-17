import type { Meta, StoryObj } from '@storybook/preact-vite';
import { TileFrame } from './TileFrame';
import { MonoHeader, MonoText, MonoLabel } from './Typography';

const meta = {
  title: 'LifeOS/Atoms',
  parameters: {
    backgrounds: { default: 'dark' }
  }
} satisfies Meta;

export default meta;

export const Tiles: StoryObj = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 h-64 p-4 bg-black">
      <TileFrame>
        <div className="p-4">
          <MonoHeader>Default Tile</MonoHeader>
          <MonoText className="mt-2">Standard border logic.</MonoText>
        </div>
      </TileFrame>
      <TileFrame variant="active">
        <div className="p-4">
          <MonoHeader className="text-[var(--los-accent)]">Active Tile</MonoHeader>
          <MonoText className="mt-2">Highlighted border and glow.</MonoText>
        </div>
      </TileFrame>
      <TileFrame variant="zen">
        <div className="p-4">
          <MonoHeader>Zen Tile</MonoHeader>
          <MonoText className="mt-2">No borders.</MonoText>
        </div>
      </TileFrame>
    </div>
  ),
};

export const Typography: StoryObj = {
  render: () => (
    <div className="space-y-4 p-8 bg-black">
      <div>
        <MonoLabel>Header</MonoLabel>
        <MonoHeader>The Digital Bento Box</MonoHeader>
      </div>
      <div>
        <MonoLabel>Paragraph</MonoLabel>
        <MonoText>
          A keyboard-centric, terminal-aesthetic "Life Operating System" that prioritizes speed, density, and focus over standard GUI conventions.
        </MonoText>
      </div>
      <div>
        <MonoLabel>Label</MonoLabel>
        <div className="mt-1">
          <MonoLabel>System Ready</MonoLabel>
        </div>
      </div>
    </div>
  )
}
