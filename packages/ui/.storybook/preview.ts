import type { Preview } from '@storybook/preact-vite';
// Cascivo CSS, in required order: components → tokens+theme → brand overrides.
import '@cascivo/react/styles.css';
import '@cascivo/editor/styles.css';
import '@cascivo/themes/dark.css';
import '../src/styles.css';
import '../src/LifeOS/styles.css';
import '../src/cascivo.css';

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
