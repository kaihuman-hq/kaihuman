import type { Meta, StoryObj } from '@storybook/preact-vite';
import { NewFileWizard } from './NewFileWizard';

// Mock data for the file system
const mockFileSystem = {
  columns: [
    {
      items: [
        { id: '/home/user/docs', title: 'Documents', type: 'FOLDER' },
        { id: '/home/user/work', title: 'Work', type: 'FOLDER' },
        { id: '/home/user/notes.md', title: 'notes.md', type: 'FILE' },
      ],
    },
  ],
};

const meta = {
  title: 'LifeOS/Organisms/NewFileWizard',
  component: NewFileWizard,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  args: {
    onClose: () => console.log('onClose triggered'),
    onCreate: (path: string, content: string) => console.log('onCreate triggered', path, content),
    fileSystem: mockFileSystem,
    availableFolders: ['/home/user/docs', '/home/user/work'], // Legacy prop, kept for compatibility if needed
    existingFiles: ['/home/user/existing.md'],
    onLoadFolder: async (path: string) => {
      console.log('Loading folder:', path);
      return [
        { id: `${path}/subfolder`, title: 'Subfolder', type: 'FOLDER' },
        { id: `${path}/file.txt`, title: 'file.txt', type: 'FILE' }
      ] as any[];
    }
  },
} satisfies Meta<typeof NewFileWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPreselectedFolder: Story = {
  args: {
    // You might want to simulate a state where a folder is pre-selected if the component supports it,
    // but looking at the code, it starts with 'TEMPLATE' step.
  },
};

export const MobileView: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
