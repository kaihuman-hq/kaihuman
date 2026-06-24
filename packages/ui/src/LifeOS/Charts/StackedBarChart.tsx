import { BarChart as BarChartImport, type StackedRow, toStackedSeries } from '@cascivo/charts';
import type { h } from 'preact';

// Cascivo ships React prop types; cast to a Preact-typed signature (same bridge
// pattern as the other wrappers in this package).
const BarChart = BarChartImport as unknown as (props: Record<string, unknown>) => h.JSX.Element;

export interface StackedBarSegment {
  value: number;
  color: string;
  label: string;
}

export interface StackedBarData {
  label: string;
  segments: StackedBarSegment[];
}

interface StackedBarChartProps {
  data: StackedBarData[];
  width: number;
  height: number;
  colors: { border: string; muted: string; bg: string };
}

export const StackedBarChart = ({ data, width, height, colors }: StackedBarChartProps) => {
  if (!width || !height || data.length === 0) return null;

  // The app's row-oriented data maps 1:1 onto Cascivo's StackedRow; `key` is the
  // layer (series) id and carries the semantic per-layer color.
  const rows: StackedRow[] = data.map((bar) => ({
    label: bar.label,
    segments: bar.segments.map((seg) => ({ key: seg.label, value: seg.value, color: seg.color })),
  }));

  // Preserve the app's exact grid/axis colors via the Cascivo chart tokens.
  const tokenStyle = {
    '--cascivo-chart-grid': colors.border,
    '--cascivo-chart-axis': colors.muted,
  } as Record<string, string>;

  return (
    <div style={tokenStyle as h.JSX.CSSProperties}>
      <BarChart
        mode="stacked"
        {...toStackedSeries(rows)}
        width={width}
        height={height}
        tooltip
        legend={false} // the caller renders its own legend below the chart
        title="Timeline"
      />
    </div>
  );
};
