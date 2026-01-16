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
  render: () => {
    const [currentRepo, setCurrentRepo] = (globalThis as any).React ? (globalThis as any).React.useState(mockRepos[0]) : [mockRepos[0], () => { }]; // Basic mock hook usage if possible, or just pass static for now. 
    // Since this is preact storybook, we might need preact hooks. But for simplicity in a story render function without component wrapper it might be tricky.
    // Let's just render the MainApp with static data or a wrapper.

    return <MainApp
      tiles={[
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
      ]}
      currentRepository={mockRepos[0]}
      repositories={mockRepos}
      onSelectRepository={(repo) => console.log('Selected repo:', repo)}
    />;
  }
};

const mockRepos = [
  { id: '1', name: 'Lifosy/monorepo', branch: 'main' },
  { id: '2', name: 'Lifosy/ui', branch: 'develop' },
  { id: '3', name: 'Lifosy/core', branch: 'feature/repo-selection' },
];

// export const ApplicationShell: StoryObj = { ... }
