import type { Meta, StoryObj } from '@storybook/preact-vite';
import { EventAddForm } from './EventAddForm';
// FocusedTile is not exported. Let's export it or just test Widgets directly.
// User requested: "add/adjust Stories for it".
// Let's test EventsWidget directly first.
import { EventsWidget } from './EventsWidget';

const meta = {
  title: 'LifeOS/Organisms/Widgets/Events',
  parameters: {
    backgrounds: { default: 'dark' },
  },
} satisfies Meta;

export default meta;

const sampleCSV = `name;type;start iso date;end iso date
Max Mustermann;birthday;1987-01-01;1987-01-01
Kickoff 2026;general;2026-01-26;2026-01-31
Late Night Coding;general;${new Date().toISOString().split('T')[0]};${new Date().toISOString().split('T')[0]}
Next Month Plan;general;${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]};${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
`;

export const WidgetSmall: StoryObj = {
  render: () => (
    <div className="w-[300px] h-[300px] border border-[var(--los-border)] bg-[var(--los-bg)] p-4 relative overflow-hidden">
      <EventsWidget content={sampleCSV} mode="SMALL" />
    </div>
  ),
};

export const WidgetFocus: StoryObj = {
  render: () => (
    <div className="w-full h-[600px] border border-[var(--los-border)] bg-[var(--los-bg)] p-8 relative">
      <EventsWidget content={sampleCSV} mode="FOCUS" />
    </div>
  ),
};

export const AddForm: StoryObj = {
  render: () => (
    <div className="w-full h-[600px] border border-[var(--los-border)] bg-[var(--los-bg)] p-8 relative flex justify-center">
      <EventAddForm onAdd={(e) => alert(JSON.stringify(e))} onCancel={() => alert('Cancel')} />
    </div>
  ),
};
