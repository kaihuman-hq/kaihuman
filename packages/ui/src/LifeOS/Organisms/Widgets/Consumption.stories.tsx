import type { Meta, StoryObj } from '@storybook/preact-vite';
import { ConsumptionWidget } from './ConsumptionWidget';

const meta = {
  title: 'LifeOS/Organisms/Widgets/ConsumptionWidget',
  parameters: {
    backgrounds: { default: 'dark' },
  },
} satisfies Meta;

export default meta;

// ---- Data generators ----

const HEADER =
  'Zeitstempel,Datum,Strom[title:Electricity;unit:kWh;yearlyTarget:3500],Wasser[title:Water;unit:m³;yearlyTarget:50],Gas[title:Gas;unit:m³;yearlyTarget:1200],Stromeinspeisung[title:Solar Feed-in;unit:kWh;yearlyTarget:800]';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Generate ~3.5 years of daily meter readings.
 * Values simulate realistic seasonal consumption patterns:
 *   - Gas: high in winter, near zero in summer
 *   - Electricity: moderate baseline, slight seasonal variation
 *   - Water: flat with minor fluctuation
 *   - Solar: zero in winter, peaks in summer
 */
function generateRichData(withGaps = false) {
  const lines: string[] = [HEADER];

  const start = new Date(2021, 0, 1); // 2021-01-01
  const end = new Date(2024, 5, 30); // 2024-06-30

  let electricity = 62000;
  let water = 120;
  let gas = 15000;
  let solar = 0;

  let day = new Date(start);
  let skip = 0;

  while (day <= end) {
    // Simulate occasional skipped days (gaps) if requested
    if (withGaps && Math.random() < 0.06 && skip < 4) {
      skip++;
      day = new Date(day.getTime() + 86400000);
      continue;
    }
    skip = 0;

    const month = day.getMonth(); // 0=Jan
    const isWinter = month <= 1 || month >= 10; // Nov–Feb
    const isSummer = month >= 4 && month <= 8; // May–Sep

    // Daily consumption deltas
    const elecDelta = isWinter
      ? 12 + Math.random() * 5
      : isSummer
        ? 7 + Math.random() * 4
        : 9 + Math.random() * 4;

    const waterDelta = 0.12 + Math.random() * 0.04;

    const gasDelta = isWinter
      ? 4 + Math.random() * 3
      : isSummer
        ? 0.05 + Math.random() * 0.1
        : 1 + Math.random() * 1.5;

    const solarDelta = isSummer ? 3 + Math.random() * 5 : isWinter ? 0 : 0.5 + Math.random() * 2;

    electricity = Math.round(electricity + elecDelta);
    water = Math.round((water + waterDelta) * 100) / 100;
    gas = Math.round((gas + gasDelta) * 1000) / 1000;
    solar = Math.round((solar + solarDelta) * 100) / 100;

    const recordedOn = new Date(day.getTime() + 86400000); // next day timestamp
    const ts = `${formatDate(recordedOn)} 07:00:00`;
    const datum = formatDate(day);

    lines.push(`${ts},${datum},${electricity},${water},${gas},${solar}`);

    day = new Date(day.getTime() + 86400000);
  }

  return lines.join('\n');
}

/** Single meter reset: electricity drops to simulate a new meter being installed */
function generateWithMeterReset() {
  const base = generateRichData();
  const rows = base.split('\n');
  // Replace ~halfway through with a reset electricity value
  const mid = Math.floor(rows.length / 2);
  const midRow = rows[mid];
  if (midRow) {
    const cols = midRow.split(',');
    if (cols.length >= 3) {
      // Reset electricity to a low value (new meter)
      cols[2] = '123';
      rows[mid] = cols.join(',');
    }
  }
  return rows.join('\n');
}

const richData = generateRichData();
const dataWithGaps = generateRichData(true);
const dataWithReset = generateWithMeterReset();

const emptyData =
  'Zeitstempel,Datum,Strom[title:Electricity;unit:kWh;yearlyTarget:3500],Gas[title:Gas;unit:m³;yearlyTarget:1200]\n';

// ---- Stories ----

export const Small: StoryObj = {
  render: () => (
    <div className="w-[340px] h-[220px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-hidden">
      <ConsumptionWidget content={richData} mode="SMALL" onChange={() => {}} />
    </div>
  ),
};

export const Focus: StoryObj = {
  render: () => (
    <div className="w-full h-[700px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-hidden">
      <ConsumptionWidget content={richData} mode="FOCUS" onChange={() => {}} />
    </div>
  ),
};

export const FocusWithGaps: StoryObj = {
  render: () => (
    <div className="w-full h-[700px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-hidden">
      <ConsumptionWidget content={dataWithGaps} mode="FOCUS" onChange={() => {}} />
    </div>
  ),
};

export const FocusWithMeterReset: StoryObj = {
  render: () => (
    <div className="w-full h-[700px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-hidden">
      <ConsumptionWidget content={dataWithReset} mode="FOCUS" onChange={() => {}} />
    </div>
  ),
};

export const Empty: StoryObj = {
  render: () => (
    <div className="w-[340px] h-[220px] border border-[var(--los-border)] bg-[var(--los-bg)] overflow-hidden">
      <ConsumptionWidget content={emptyData} mode="SMALL" onChange={() => {}} />
    </div>
  ),
};
