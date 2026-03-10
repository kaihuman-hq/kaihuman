import { useState } from 'preact/hooks';

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

function annularPath(
  cx: number,
  cy: number,
  R: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const delta = endAngle - startAngle;
  if (Math.abs(delta) < 0.001) return '';
  const x1 = cx + R * Math.cos(startAngle);
  const y1 = cy + R * Math.sin(startAngle);
  const x2 = cx + R * Math.cos(endAngle);
  const y2 = cy + R * Math.sin(endAngle);
  const ix1 = cx + r * Math.cos(startAngle);
  const iy1 = cy + r * Math.sin(startAngle);
  const ix2 = cx + r * Math.cos(endAngle);
  const iy2 = cy + r * Math.sin(endAngle);
  const large = delta > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`;
}

export const DonutChart = ({
  segments,
  size = 160,
  thickness = 32,
  centerLabel,
  centerValue,
}: DonutChartProps) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return (
      <div style={{ width: size, height: size }} className="flex items-center justify-center">
        <span className="text-[10px] font-mono text-[#858595]">NO DATA</span>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 4;
  const r = R - thickness;
  const GAP = segments.length > 1 ? 0.02 : 0;

  let accumulated = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="Donut chart">
        {segments.map((seg, i) => {
          const ratio = seg.value / total;
          const startAngle = accumulated * 2 * Math.PI - Math.PI / 2 + GAP / 2;
          const endAngle = (accumulated + ratio) * 2 * Math.PI - Math.PI / 2 - GAP / 2;
          accumulated += ratio;
          const d = annularPath(cx, cy, R, r, startAngle, endAngle);
          if (!d) return null;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: chart segment hover interaction
            <path
              key={seg.label}
              d={d}
              fill={seg.color}
              opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.35}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}
        {centerValue && (
          <text
            x={cx}
            y={cy - (centerLabel ? 6 : 5)}
            textAnchor="middle"
            fill="#e0e0e8"
            fontSize="16"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            fill="#858595"
            fontSize="9"
            fontFamily="monospace"
          >
            {centerLabel}
          </text>
        )}
      </svg>
      {hoveredIdx !== null && segments[hoveredIdx] && (
        <div
          className="absolute pointer-events-none bg-[#0a0a0f] border border-[#2a2a35] px-2 py-1.5 z-10 shadow-xl whitespace-nowrap"
          style={{ left: size + 6, top: 0 }}
        >
          <p className="text-[10px] font-mono text-[#e0e0e8]">{segments[hoveredIdx].label}</p>
          <p className="text-[10px] font-mono" style={{ color: segments[hoveredIdx].color }}>
            {segments[hoveredIdx].value} ({Math.round((segments[hoveredIdx].value / total) * 100)}%)
          </p>
        </div>
      )}
    </div>
  );
};
