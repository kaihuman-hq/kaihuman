import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Login } from './Login';

const meta = {
  title: 'LifeOS/Templates/Login',
  component: Login,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'nexus-bg' },
  },
  args: {
    onLogin: () => {
      console.log('Login clicked');
    },
  },
} satisfies Meta<typeof Login>;

export default meta;
type Story = StoryObj<typeof Login>;

/** Full desktop two-column layout */
export const Desktop: Story = {};

/** Mobile view — hero hidden, login panel only */
export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

/** Tablet — hero just starts to appear at lg breakpoint */
export const Tablet: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};
