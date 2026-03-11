import type { Preview } from '@storybook/preact-vite';
import '../src/styles.css';
import '../src/LifeOS/styles.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      options: {
        'nexus-bg': {
          name: 'nexus-bg',
          value: '#0a0a0f',
        },

        light: {
          name: 'light',
          value: '#ffffff',
        },
      },
    },
  },

  initialGlobals: {
    backgrounds: {
      value: 'nexus-bg',
    },
  },
};

export default preview;
