import type { Meta, StoryObj } from '@storybook/preact';
import { MainApp } from './MainApp';
import { MonoHeader, MonoText } from '../Atoms/Typography';

const meta = {
  title: 'LifeOS/Layouts',
  parameters: {
    backgrounds: { default: 'dark' },
    layout: 'fullscreen'
  }
} satisfies Meta;

export default meta;

export const TileMatrix: StoryObj = {
  render: () => <MainApp tiles={[
    ...Array.from({ length: 24 }, (_, i) => ({
      id: i,
      title: `Story Tile ${i}`,
      content: (
        <div className="p-8 h-full flex flex-col">
          <MonoHeader className="mb-4">Custom Content for Tile {i}</MonoHeader>
          <div className="flex-1 border border-[var(--los-border)] p-4 bg-black/20">
            <MonoText>This content is defined in the Storybook story.</MonoText>
          </div>
        </div>
      )
    }))
  ]} />
};

// export const ApplicationShell: StoryObj = { ... }
