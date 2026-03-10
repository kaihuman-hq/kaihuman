import { useState } from 'preact/hooks';

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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!width || !height || data.length === 0) return null;

  const padding = { top: 10, right: 10, bottom: 24, left: 32 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxTotal = Math.max(...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)), 1);

  const barStep = chartWidth / data.length;
  const barWidth = Math.max(barStep * 0.75, 2);
  const getX = (i: number) => padding.left + i * barStep + (barStep - barWidth) / 2;
  const getBarH = (val: number) => (val / maxTotal) * chartHeight;
  const yTicks = 4;
  const labelStep = Math.max(Math.ceil(data.length / 8), 1);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: chart mouse tracking
    <div className="relative w-full h-full" onMouseLeave={() => setHoveredIndex(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Stacked bar chart"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - padding.left;
          const idx = Math.floor(x / barStep);
          setHoveredIndex(idx >= 0 && idx < data.length ? idx : null);
        }}
      >
        {/* Grid lines + Y labels */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = padding.top + (chartHeight / yTicks) * i;
          const val = Math.round(maxTotal - (maxTotal / yTicks) * i);
          return (
            <g key={`grid-${val}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={colors.border}
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
              {i < yTicks && (
                <text
                  x={padding.left - 4}
                  y={y + 3}
                  textAnchor="end"
                  fill={colors.muted}
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              )}
            </g>
          );
        })}

        {/* Stacked bars */}
        {data.map((bar, i) => {
          let yOffset = padding.top + chartHeight;
          const x = getX(i);
          return (
            <g key={bar.label} opacity={hoveredIndex !== null && hoveredIndex !== i ? 0.4 : 1}>
              {bar.segments.map((seg) => {
                if (seg.value === 0) return null;
                const h = getBarH(seg.value);
                yOffset -= h;
                return (
                  <rect
                    key={seg.label}
                    x={x}
                    y={yOffset}
                    width={barWidth}
                    height={h}
                    fill={seg.color}
                  />
                );
              })}
            </g>
          );
        })}

        {/* X axis labels (thinned) */}
        {data.map((bar, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={bar.label}
              x={getX(i) + barWidth / 2}
              y={height - 6}
              textAnchor="middle"
              fill={colors.muted}
              fontSize="8"
              fontFamily="monospace"
            >
              {bar.label}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null &&
        data[hoveredIndex] &&
        (() => {
          const bar = data[hoveredIndex];
          const total = bar.segments.reduce((s, seg) => s + seg.value, 0);
          return (
            <div
              className="absolute pointer-events-none z-10 shadow-xl"
              style={{
                left: Math.min(getX(hoveredIndex) + barWidth + 8, width - 148),
                top: padding.top,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                padding: '6px 8px',
              }}
            >
              <p
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: colors.muted,
                  marginBottom: 4,
                }}
              >
                {bar.label} · {total}
              </p>
              {bar.segments
                .filter((s) => s.value > 0)
                .map((seg) => (
                  <p
                    key={seg.label}
                    style={{ fontFamily: 'monospace', fontSize: 10, color: seg.color }}
                  >
                    {seg.label}: {seg.value}
                  </p>
                ))}
            </div>
          );
        })()}
    </div>
  );
};
