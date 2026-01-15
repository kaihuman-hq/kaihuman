import type { Meta, StoryObj } from '@storybook/preact';
import { MainApp } from './MainApp';

const meta = {
  title: 'LifeOS/Layouts',
  parameters: {
    backgrounds: { default: 'dark' },
    layout: 'fullscreen'
  }
} satisfies Meta;

export default meta;

export const TileMatrix: StoryObj = {
  render: () => <MainApp />
};

// export const ApplicationShell: StoryObj = { ... }
