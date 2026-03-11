import type { Meta, StoryObj } from '@storybook/preact-vite';
import { MonoText } from '../Atoms/Typography';
import { Editor } from './Editor';
import { FileBrowser } from './FileBrowser';
import { StatusBar } from './StatusBar';

const meta = {
  title: 'LifeOS/Organisms',
  parameters: {
    backgrounds: { default: 'dark' },
  },
} satisfies Meta;

export default meta;

export const StatusBarComponent: StoryObj = {
  render: () => (
    <div className="h-64 bg-black relative flex flex-col border border-gray-800">
      <div className="flex-1 flex items-center justify-center">
        <MonoText>App Content Area</MonoText>
      </div>
      <StatusBar
        mode="NORMAL"
        breadcrumbs={['home', 'dev', 'monorepo']}
        stats={[
          { label: 'CPU', value: '12%' },
          { label: 'MEM', value: '1.2GB' },
        ]}
        version={{
          version: '0.1.1',
          buildTime: '2026-02-06T09:41:30.219Z',
          gitHash: 'f6eaefc',
          full: 'v0.1.1-f6eaefc',
        }}
        menuItems={[{ label: 'New File' }, { label: 'Search' }, { label: 'Settings' }]}
      />
    </div>
  ),
};

export const EditorComponent: StoryObj = {
  render: () => (
    <div className="h-64 border border-[var(--los-border)]">
      <Editor />
    </div>
  ),
};

export const FileBrowserComponent: StoryObj = {
  render: () => (
    <div className="h-64 border border-[var(--los-border)]">
      <FileBrowser />
    </div>
  ),
};
