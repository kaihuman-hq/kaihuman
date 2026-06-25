import { type PieChartDatum, PieChart as PieChartImport } from '@cascivo/charts';
import type { h } from 'preact';

// Cascivo ships React prop types; cast to a Preact-typed signature (same bridge
// pattern as the other wrappers in this package).
const PieChart = PieChartImport as unknown as (props: Record<string, unknown>) => h.JSX.Element;

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}

export const DonutChart = ({
  segments,
  size = 160,
  thickness = 32,
  centerLabel,
  centerValue,
}: DonutChartProps) => {
  const data: PieChartDatum[] = segments.map((seg, i) => ({
    id: `${i}-${seg.label}`,
    label: seg.label,
    value: seg.value,
    color: seg.color, // semantic per-slice color (overrides the positional palette)
  }));

  return (
    <PieChart
      data={data}
      donut
      size={size}
      thickness={thickness}
      centerValue={centerValue}
      centerLabel={centerLabel}
      title={centerLabel ?? 'Distribution'}
      emptyLabel="NO DATA"
      plain // the caller renders its own legend beside the chart
    />
  );
};
