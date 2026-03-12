import type { Meta, StoryObj } from '@storybook/preact-vite';
import { StocksWidget } from './StocksWidget';

const meta = {
  title: 'LifeOS/Organisms/Widgets/StocksWidget',
  parameters: {
    backgrounds: { default: 'dark' },
  },
} satisfies Meta;

export default meta;

// ~6 years of weekly entries (value grows from ~500 to ~100k, invest increases linearly)
const generateData = () => {
  const lines: string[] = [];
  const start = new Date('2020-02-01');
  let value = 486;
  let invest = 0;

  for (let week = 0; week < 320; week++) {
    const d = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} 00:00:00`;

    // Simulate steady growth with noise
    value = Math.round(value * (1 + (Math.random() * 0.04 - 0.01)));
    if (week % 4 === 0) invest += 250; // monthly investment

    lines.push(`${ts};${value};${invest}`);
  }
  return `${lines.join('\n')}\n`;
};

const richData = generateData();

const sparseData = `01.01.2024 00:00:00;8000;5000
01.04.2024 00:00:00;9200;6000
01.07.2024 00:00:00;8700;7000
01.10.2024 00:00:00;11000;8000
01.01.2025 00:00:00;13500;9000
01.03.2025 00:00:00;15200;10000
`;

export const Small: StoryObj = {
  render: () => (
    <div className="w-[220px] h-[180px] border border-[var(--los-border)] bg-[var(--los-bg)] relative overflow-hidden">
      <StocksWidget content={richData} mode="SMALL" onChange={() => {}} />
    </div>
  ),
};

export const Focus: StoryObj = {
  render: () => (
    <div className="w-full h-[700px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-auto">
      <StocksWidget content={richData} mode="FOCUS" onChange={() => {}} />
    </div>
  ),
};

export const FocusSparseData: StoryObj = {
  render: () => (
    <div className="w-full h-[700px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-auto">
      <StocksWidget content={sparseData} mode="FOCUS" onChange={() => {}} />
    </div>
  ),
};

export const AddEntry: StoryObj = {
  render: () => (
    <div className="w-full h-[400px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-auto">
      <StocksWidget content={richData} mode="ADD" onChange={() => {}} />
    </div>
  ),
};

export const Empty: StoryObj = {
  render: () => (
    <div className="w-[220px] h-[180px] border border-[var(--los-border)] bg-[var(--los-bg)]">
      <StocksWidget content="" mode="SMALL" onChange={() => {}} />
    </div>
  ),
};
