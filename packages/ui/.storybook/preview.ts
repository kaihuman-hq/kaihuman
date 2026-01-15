import type { Preview } from "@storybook/preact";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'nexus-bg',
      values: [
        {
          name: 'nexus-bg',
          value: '#0a0a0f',
        },
        {
          name: 'light',
          value: '#ffffff',
        },
      ],
    }
  },
};

export default preview;
