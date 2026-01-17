import type { Meta, StoryObj } from '@storybook/preact-vite';
import { TimeTrackingWidget } from './TimeTrackingWidget';
import { TimeTrackingCharts } from './TimeTrackingCharts';

const meta = {
  title: 'LifeOS/Organisms/Widgets/TimeTracking',
  parameters: {
    backgrounds: { default: 'dark' }
  }
} satisfies Meta;

export default meta;

// Generate 25 days of data
const generateData = () => {
  let csv = 'iso date;time\n';
  const today = new Date();

  for (let i = 0; i < 25; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Simulate some realistic patterns
    // Weekends (0 = Sun, 6 = Sat) - maybe less work or skip
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (isWeekend && Math.random() > 0.3) continue; // Skip some weekends

    // Varying start times 08:00 - 10:00
    const startH = 8 + Math.floor(Math.random() * 3);
    const startM = Math.floor(Math.random() * 60).toString().padStart(2, '0');

    // Lunch break around 12-13
    const lunchStartH = 12;
    const lunchStartM = Math.floor(Math.random() * 30).toString().padStart(2, '0');
    const lunchEndH = 13;
    const lunchEndM = Math.floor(Math.random() * 30).toString().padStart(2, '0');

    // End time 16:00 - 19:00
    const endH = 16 + Math.floor(Math.random() * 4);
    const endM = Math.floor(Math.random() * 60).toString().padStart(2, '0');

    // Construct line: start, lunch_start, lunch_end, end
    // Format: HH:MM
    const t1 = `${startH.toString().padStart(2, '0')}:${startM}`;
    const t2 = `${lunchStartH}:${lunchStartM}`;
    const t3 = `${lunchEndH}:${lunchEndM}`;
    const t4 = `${endH}:${endM}`;

    csv += `${dateStr};${t1},${t2},${t3},${t4}\n`;
  }
  return csv;
};

const richData = generateData();

export const WidgetSmall: StoryObj = {
  render: () => (
    <div className="w-[300px] h-[300px] border border-[var(--los-border)] bg-[var(--los-bg)] p-4 relative overflow-hidden">
      <TimeTrackingWidget
        content={richData}
        onChange={() => { }}
        mode="SMALL"
      />
    </div>
  )
};

export const WidgetFocus: StoryObj = {
  render: () => (
    <div className="w-full h-[600px] border border-[var(--los-border)] bg-[var(--los-bg)] p-8 relative">
      <TimeTrackingWidget
        content={richData}
        onChange={() => { }}
        mode="FOCUS"
      />
    </div>
  )
};

export const ChartsOnly: StoryObj = {
  render: () => (
    <div className="w-full h-[500px] border border-[var(--los-border)] bg-[var(--los-bg)] p-8">
      <TimeTrackingCharts data={richData} />
    </div>
  )
};
