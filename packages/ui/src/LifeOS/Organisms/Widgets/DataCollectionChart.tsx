import { h } from 'preact';
import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { DataCollectionData } from './DataCollectionLogic';

interface DataCollectionChartProps {
  data: DataCollectionData;
  width?: number;
  height?: number;
}

// Simple Color Palette
const COLORS = [
  '#00f0ff', // Cyan
  '#ff00ff', // Magenta
  '#00ff00', // Green
  '#ffff00', // Yellow
  '#ff0000', // Red
  '#0000ff', // Blue
  '#ffffff', // White
];

// Helper to reliably parse date
const parseDate = (val: any) => {
  if (!val) return new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
};

export const DataCollectionChart = ({ data, width: propWidth, height: propHeight, hideLegend }: DataCollectionChartProps & { hideLegend?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (propWidth && propHeight) {
      setDimensions({ width: propWidth, height: propHeight });
      return;
    }
    if (!chartRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [propWidth, propHeight]);

  const { width, height } = dimensions;

  // Identify Numeric Columns (Potential Lines)
  // Exclude 'created' if it is just x-axis
  const numericColumns = useMemo(() => {
    return data.columns.filter(c =>
      c.type === 'number' ||
      c.type === 'auto:number:sum' ||
      c.type === 'auto:number:avg'
    );
  }, [data.columns]);

  // Identify X-Axis Column (Prefer 'created' or first date column)
  const xColumn = useMemo(() => {
    return data.columns.find(c => c.name === 'created') ||
      data.columns.find(c => c.type.includes('date')) ||
      data.columns[0];
  }, [data.columns]);

  // Toggle State for Lines
  const [activeLines, setActiveLines] = useState<string[]>([]);

  // Initialize Active Lines (Default to all)
  useEffect(() => {
    setActiveLines(numericColumns.map(c => c.name));
  }, [numericColumns]);

  const toggleLine = (name: string) => {
    setActiveLines(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  // Prepare Grid Data
  // Sort rows by date if xColumn is date
  const sortedRows = useMemo(() => {
    const rows = [...data.rows];
    if (xColumn && xColumn.type.includes('date')) {
      rows.sort((a, b) => parseDate(a[xColumn.name]).getTime() - parseDate(b[xColumn.name]).getTime());
    }
    return rows;
  }, [data.rows, xColumn]);

  // Chart Logic Validations
  const hasData = sortedRows.length > 0 && numericColumns.length > 0 && !!xColumn;

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Max value calculation for Y scale
  const maxValue = useMemo(() => {
    if (!hasData) return 10;
    let max = 0;
    sortedRows.forEach(row => {
      numericColumns.forEach(col => {
        if (activeLines.includes(col.name)) {
          const val = Number(row[col.name]) || 0;
          if (val > max) max = val;
        }
      });
    });
    return max > 0 ? max * 1.1 : 10; // add padding
  }, [sortedRows, numericColumns, activeLines, hasData]);

  // Scales
  const getX = (index: number) => {
    if (sortedRows.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (sortedRows.length - 1)) * chartWidth;
  };

  const getY = (val: number) => padding.top + chartHeight - (val / maxValue) * chartHeight;

  // Path Generator
  const createPath = (colName: string) => {
    if (sortedRows.length === 0) return '';
    return sortedRows.map((row, i) => {
      const val = Number(row[colName]) || 0;
      return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`;
    }).join(' ');
  };

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleMouseMove = (e: any) => {
    if (!hasData || !width || !height) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    const count = sortedRows.length;
    let index = 0;
    if (count > 1) {
      index = Math.min(Math.max(Math.round((x / chartWidth) * (count - 1)), 0), count - 1);
    }
    setHoveredIndex(index);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 w-full min-h-[200px] relative" ref={containerRef}>
        <div className="absolute inset-0 pb-8" ref={chartRef} onMouseLeave={() => setHoveredIndex(null)}>
          {(!hasData || !width || !height) ? (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--los-muted)]">
              No data to chart
            </div>
          ) : (
            <>
              <svg width={width} height={height} onMouseMove={handleMouseMove}>
                {/* Grid Lines */}
                {Array.from({ length: 5 }).map((_, i) => {
                  const y = padding.top + (chartHeight / 4) * i;
                  const val = maxValue - (maxValue / 4) * i;
                  return (
                    <g key={i}>
                      <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--los-border)" strokeDasharray="4 4" />
                      <text x={padding.left - 5} y={y + 3} textAnchor="end" className="text-[9px] fill-[var(--los-muted)] font-mono">{val.toFixed(0)}</text>
                    </g>
                  )
                })}

                {/* X Axis */}
                {sortedRows.length > 1 && (
                  <>
                    <text x={padding.left} y={height - 5} className="text-[9px] fill-[var(--los-muted)] font-mono">
                      {xColumn.type.includes('date')
                        ? parseDate(sortedRows[0]?.[xColumn.name]).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
                        : sortedRows[0]?.[xColumn.name]}
                    </text>
                    <text x={width - padding.right} y={height - 5} textAnchor="end" className="text-[9px] fill-[var(--los-muted)] font-mono">
                      {xColumn.type.includes('date')
                        ? parseDate(sortedRows[sortedRows.length - 1]?.[xColumn.name]).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
                        : sortedRows[sortedRows.length - 1]?.[xColumn.name]}
                    </text>
                  </>
                )}

                {/* Lines */}
                {numericColumns.map((col, i) => {
                  if (!activeLines.includes(col.name)) return null;
                  return (
                    <path
                      key={col.name}
                      d={createPath(col.name)}
                      fill="none"
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth="2"
                    />
                  );
                })}

                {/* Hover Indicator */}
                {hoveredIndex !== null && (
                  <line
                    x1={getX(hoveredIndex)} y1={padding.top}
                    x2={getX(hoveredIndex)} y2={height - padding.bottom}
                    stroke="var(--los-border)"
                  />
                )}

                {/* Dots on Hover */}
                {hoveredIndex !== null && numericColumns.map((col, i) => {
                  if (!activeLines.includes(col.name)) return null;
                  const val = Number(sortedRows[hoveredIndex]?.[col.name]) || 0;
                  return (
                    <circle
                      key={col.name}
                      cx={getX(hoveredIndex)}
                      cy={getY(val)}
                      r="3"
                      fill="var(--los-bg)"
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth="2"
                    />
                  )
                })}
              </svg>

              {/* Tooltip */}
              {hoveredIndex !== null && (
                <div
                  className="absolute z-10 bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded shadow-xl pointer-events-none"
                  style={{
                    left: Math.min(getX(hoveredIndex) + 20, width - 150),
                    top: 20
                  }}
                >
                  <div className="text-[10px] text-[var(--los-muted)] font-mono mb-1">
                    {xColumn.type.includes('date')
                      ? parseDate(sortedRows[hoveredIndex]?.[xColumn.name]).toLocaleDateString()
                      : sortedRows[hoveredIndex]?.[xColumn.name]}
                  </div>
                  {numericColumns.map((col, i) => {
                    if (!activeLines.includes(col.name)) return null;
                    const val = Number(sortedRows[hoveredIndex]?.[col.name]);
                    return (
                      <div key={col.name} className="flex items-center gap-2 text-[10px] font-mono">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-[var(--los-muted)]">{col.name}:</span>
                        <span className="text-[var(--los-fg)]">{isNaN(val) ? '-' : val.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Legend */}
        {!hideLegend && hasData && (
          <div className="h-8 border-t border-[var(--los-border)] flex items-center justify-end px-2 gap-3 shrink-0 overflow-x-auto scrollbar-hide">
            {numericColumns.map((col, i) => (
              <button
                key={col.name}
                onClick={() => toggleLine(col.name)}
                className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity whitespace-nowrap"
                style={{ opacity: activeLines.includes(col.name) ? 1 : 0.4 }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-[9px] font-mono text-[var(--los-muted)]">{col.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
