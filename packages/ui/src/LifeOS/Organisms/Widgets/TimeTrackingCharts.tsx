import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader } from '../../Atoms/Typography';
import { getChartData, parseTimeTracking, type TimeTrackingData } from './TimeTrackingLogic';

interface TimeTrackingChartsProps {
  data: string | TimeTrackingData;
}

// Simple useResizeObserver hook
const useResizeObserver = (ref: any) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return dimensions;
};

// --- Native SVG Components ---

const NativeLineChart = ({ data, width, height, colors }: any) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!width || !height || data.length === 0) return null;

  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxHours = Math.max(...data.map((d: any) => Math.max(d.workHours, d.breakHours)), 1);

  // Scales
  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (val: number) => padding.top + chartHeight - (val / maxHours) * chartHeight;

  // Path Generators
  const createPath = (key: string) => {
    if (data.length <= 1) {
      // For single point, just draw a small line or invalid path?
      // Better to draw nothing for line, but dots will show.
      return `M ${getX(0)} ${getY(data[0][key])}`;
    }
    return data
      .map((d: any, i: number) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key])}`)
      .join(' ');
  };

  const handleMouseMove = (e: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    const count = data.length;
    let index = 0;
    if (count > 1) {
      index = Math.min(Math.max(Math.round((x / chartWidth) * (count - 1)), 0), count - 1);
    }
    setHoveredIndex(index);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: chart interaction div
    <div className="relative w-full h-full" onMouseLeave={() => setHoveredIndex(null)}>
      <svg
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        role="img"
        aria-label="Line chart"
      >
        {/* Grid */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padding.top + (chartHeight / 4) * i;
          return (
            <line
              key={y}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={colors.border}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Y Axis Labels */}
        {Array.from({ length: 5 }).map((_, i) => {
          const val = maxHours - (maxHours / 4) * i;
          const y = padding.top + (chartHeight / 4) * i;
          return (
            <text
              key={val}
              x={padding.left - 6}
              y={y + 3}
              textAnchor="end"
              fill={colors.muted}
              className="font-mono text-[9px]"
            >
              {val.toFixed(0)}
            </text>
          );
        })}

        {/* X Axis First/Last Labels */}
        <text x={padding.left} y={height - 5} fill={colors.muted} className="font-mono text-[9px]">
          {data[0].date}
        </text>
        {data.length > 1 && (
          <text
            x={width - padding.right}
            y={height - 5}
            textAnchor="end"
            fill={colors.muted}
            className="font-mono text-[9px]"
          >
            {data[data.length - 1].date}
          </text>
        )}

        {/* Lines */}
        <path
          d={createPath('breakHours')}
          fill="none"
          stroke={colors.muted}
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <path d={createPath('workHours')} fill="none" stroke={colors.accent} strokeWidth="2" />

        {/* Hover Highlight */}
        {hoveredIndex !== null && (
          <line
            x1={getX(hoveredIndex)}
            y1={padding.top}
            x2={getX(hoveredIndex)}
            y2={height - padding.bottom}
            stroke={colors.border}
            strokeWidth="1"
          />
        )}

        {hoveredIndex !== null && (
          <>
            <circle
              cx={getX(hoveredIndex)}
              cy={getY(data[hoveredIndex].workHours)}
              r="4"
              fill={colors.bg}
              stroke={colors.accent}
              strokeWidth="2"
            />
            <circle
              cx={getX(hoveredIndex)}
              cy={getY(data[hoveredIndex].breakHours)}
              r="4"
              fill={colors.bg}
              stroke={colors.muted}
              strokeWidth="2"
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="absolute pointer-events-none bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded shadow-lg z-10"
          style={{
            left: Math.min(getX(hoveredIndex) + 10, width - 150), // Prevent overflow right
            top: 10,
          }}
        >
          <p
            className="text-[10px] text-[var(--los-muted)] mb-1"
            style={{ fontFamily: 'var(--los-font-mono)' }}
          >
            {data[hoveredIndex].date}
          </p>
          <p
            className="text-[10px]"
            style={{ fontFamily: 'var(--los-font-mono)', color: colors.accent }}
          >
            Work: {data[hoveredIndex].workHours}h
          </p>
          <p
            className="text-[10px]"
            style={{ fontFamily: 'var(--los-font-mono)', color: colors.muted }}
          >
            Breaks: {data[hoveredIndex].breakHours}h
          </p>
        </div>
      )}
    </div>
  );
};

const NativeBarChart = ({ data, width, height, colors }: any) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!width || !height || data.length === 0) return null;

  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxHours = Math.max(...data.map((d: any) => d.hours), 1);
  const barWidth = (chartWidth / data.length) * 0.8;
  const gap = (chartWidth / data.length) * 0.2;

  const getX = (index: number) => padding.left + index * (chartWidth / data.length) + gap / 2;
  const getY = (val: number) => padding.top + chartHeight - (val / maxHours) * chartHeight;
  const getH = (val: number) => (val / maxHours) * chartHeight;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: chart interaction div
    <div className="relative w-full h-full" onMouseLeave={() => setHoveredIndex(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Bar chart"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - padding.left;
          const index = Math.floor(x / (chartWidth / data.length));
          if (index >= 0 && index < data.length) setHoveredIndex(index);
        }}
      >
        {/* Grid */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padding.top + (chartHeight / 4) * i;
          return (
            <line
              key={y}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={colors.border}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Y Axis */}
        {Array.from({ length: 5 }).map((_, i) => {
          const val = maxHours - (maxHours / 4) * i;
          const y = padding.top + (chartHeight / 4) * i;
          return (
            <text
              key={val}
              x={padding.left - 6}
              y={y + 3}
              textAnchor="end"
              fill={colors.muted}
              className="font-mono text-[9px]"
            >
              {val.toFixed(0)}
            </text>
          );
        })}

        {/* X Axis Labels (Every 5th or first/last if too many) */}
        {data.map((d: any, i: number) => {
          // Simple thinning logic
          if (data.length > 10 && i % Math.ceil(data.length / 5) !== 0) return null;
          return (
            <text
              key={d.week || d.month}
              x={getX(i) + barWidth / 2}
              y={height - 5}
              textAnchor="middle"
              fill={colors.muted}
              className="font-mono text-[9px]"
            >
              {d.week || d.month}
            </text>
          );
        })}

        {/* Bars */}
        {data.map((d: any, i: number) => (
          <rect
            key={d.week || d.month}
            x={getX(i)}
            y={getY(d.hours)}
            width={barWidth}
            height={getH(d.hours)}
            fill={colors.accent}
            opacity={hoveredIndex === i ? 0.8 : 1}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div
          className="absolute pointer-events-none bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded shadow-lg z-10"
          style={{
            left: Math.min(getX(hoveredIndex) + barWidth + 10, width - 150),
            top: getY(data[hoveredIndex].hours),
          }}
        >
          <p
            className="text-[10px] text-[var(--los-muted)] mb-1"
            style={{ fontFamily: 'var(--los-font-mono)' }}
          >
            {data[hoveredIndex].week || data[hoveredIndex].month}
          </p>
          <p
            className="text-[10px]"
            style={{ fontFamily: 'var(--los-font-mono)', color: colors.accent }}
          >
            {data[hoveredIndex].hours}h
          </p>
        </div>
      )}
    </div>
  );
};

// --- Main Component ---

export const TimeTrackingCharts = ({ data }: TimeTrackingChartsProps) => {
  const parsedData = useMemo(() => {
    return typeof data === 'string' ? parseTimeTracking(data) : data;
  }, [data]);

  const chartData = useMemo(() => getChartData(parsedData), [parsedData]);
  const [view, setView] = useState<'DAILY' | 'AGGREGATED'>('DAILY');
  const [aggregation, setAggregation] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');

  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useResizeObserver(containerRef);

  const COLORS = {
    // We can use the CSS variables directly here if we are confident, or fallback
    accent: '#00f0ff', // Hardcoded cyan for safety as per previous request
    muted: '#858595',
    border: '#2a2a35',
    bg: '#0a0a0f',
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <MonoHeader className="text-lg">ANALYTICS</MonoHeader>
        <div className="flex gap-2">
          <div className="flex bg-[var(--los-border)] rounded-sm p-0.5">
            <button
              type="button"
              onClick={() => setView('DAILY')}
              className={cn(
                'px-3 py-1 text-[10px] font-mono transition-colors rounded-sm',
                view === 'DAILY'
                  ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                  : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
              )}
            >
              DAILY
            </button>
            <button
              type="button"
              onClick={() => setView('AGGREGATED')}
              className={cn(
                'px-3 py-1 text-[10px] font-mono transition-colors rounded-sm',
                view === 'AGGREGATED'
                  ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                  : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
              )}
            >
              AGGREGATED
            </button>
          </div>

          {view === 'AGGREGATED' && (
            <div className="flex bg-[var(--los-border)] rounded-sm p-0.5 animate-in fade-in slide-in-from-right-2">
              <button
                type="button"
                onClick={() => setAggregation('WEEKLY')}
                className={cn(
                  'px-3 py-1 text-[10px] font-mono transition-colors rounded-sm',
                  aggregation === 'WEEKLY'
                    ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                    : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                )}
              >
                WEEK
              </button>
              <button
                type="button"
                onClick={() => setAggregation('MONTHLY')}
                className={cn(
                  'px-3 py-1 text-[10px] font-mono transition-colors rounded-sm',
                  aggregation === 'MONTHLY'
                    ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                    : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                )}
              >
                MONTH
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full min-h-[200px] relative" ref={containerRef}>
        <div className="absolute inset-0 pb-8">
          {view === 'DAILY' ? (
            <NativeLineChart
              data={chartData.daily}
              width={width}
              height={height - 32} // adjust for footer padding roughly
              colors={COLORS}
            />
          ) : (
            <NativeBarChart
              data={aggregation === 'WEEKLY' ? chartData.weekly : chartData.monthly}
              width={width}
              height={height - 32}
              colors={COLORS}
            />
          )}
        </div>
      </div>

      {/* Legend / Stats Footer */}
      <div className="h-8 border-t border-[var(--los-border)] flex items-center justify-end gap-4 shrink-0 text-[10px] text-[var(--los-muted)]">
        <div className="flex items-center gap-2">
          {/* Legend colors should match chart hardcoded colors */}
          <div className="w-2 h-0.5 bg-[#00f0ff]" />
          <span>WORK HOURS</span>
        </div>
        {view === 'DAILY' && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-0.5 bg-[#858595] border-t border-dashed" />
            <span>BREAKS</span>
          </div>
        )}
      </div>
    </div>
  );
};
