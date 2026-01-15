import type { Meta, StoryObj } from '@storybook/preact';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from './Dialog';
import { Button } from './Button';

const meta = {
  title: 'Nexus/Dialog',
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger>
        <Button variant="danger" label="Start Mission" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mission Confirmation</DialogTitle>
          <DialogDescription>
            Are you sure you want to initialize the mission? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-nexus-text">Additional mission parameters can be configured here.</p>
        </div>
        <DialogFooter>
          <DialogClose>
            <Button variant="ghost" label="Abort" />
          </DialogClose>
          <Button label="Engage" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
