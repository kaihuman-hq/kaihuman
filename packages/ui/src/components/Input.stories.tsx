import type { Meta, StoryObj } from '@storybook/preact';
import { Input } from './Input';

const meta = {
  title: 'Nexus/Input',
  component: Input,
  tags: ['autodocs'],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Type something...',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: 'Disabled input',
  },
};

export const Error: Story = {
  args: {
    error: true,
    value: 'Invalid entry',
  },
};
