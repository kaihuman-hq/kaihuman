import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type DataCollectionData, parseCollectionDate } from './DataCollectionLogic';

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

// Helper to reliably parse date — delegates to the shared logic helper
const parseDate = (val: unknown): Date => parseCollectionDate(val) ?? new Date();

// Helper to format number with K/M abbreviations
const formatNumber = (num: number) => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return num.toString();
};

// ─── Delta Chart ──────────────────────────────────────────────────────────────

/**
 * Shows the change between consecutive rows for each numeric column.
 * Positive deltas → green tint, negative → red tint.
 */
export const DataCollectionDeltaChart = ({
  data,
  hideLegend,
}: DataCollectionChartProps & { hideLegend?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const { width, height } = dimensions;

  const numericColumns = useMemo(
    () =>
      data.columns.filter(
        (c) => c.type === 'number' || c.type === 'auto:number:sum' || c.type === 'auto:number:avg',
      ),
    [data.columns],
  );

  const xColumn = useMemo(
    () =>
      data.columns.find((c) => c.name === 'created') ||
      data.columns.find((c) => c.type.includes('date')) ||
      data.columns[0],
    [data.columns],
  );

  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const isLineActive = (name: string) => selectedLines.length === 0 || selectedLines.includes(name);

  // Sort rows by date, then compute deltas between consecutive entries
  const { deltaRows, labels } = useMemo(() => {
    const rows = [...data.rows];
    if (xColumn?.type.includes('date')) {
      rows.sort(
        (a, b) => parseDate(a[xColumn.name]).getTime() - parseDate(b[xColumn.name]).getTime(),
      );
    }
    if (rows.length < 2) return { deltaRows: [], labels: [] };

    const dr = rows.slice(1).map((row, i) => {
      const prev = rows[i] as (typeof rows)[0];
      const deltas: Record<string, number> = {};
      for (const col of numericColumns) {
        deltas[col.name] = (Number(row[col.name]) || 0) - (Number(prev[col.name]) || 0);
      }
      return { row, deltas };
    });

    const lbl = rows.slice(1).map((row) =>
      xColumn?.type.includes('date')
        ? parseDate(row[xColumn.name]).toLocaleDateString(undefined, {
            month: 'short',
            year: '2-digit',
          })
        : String(row[xColumn?.name ?? ''] ?? ''),
    );

    return { deltaRows: dr, labels: lbl };
  }, [data.rows, xColumn, numericColumns]);

  const hasData = deltaRows.length > 0 && numericColumns.length > 0;

  const pad = { top: 20, right: 16, bottom: 28, left: 48 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  // Symmetric Y range around 0
  const yExtent = useMemo(() => {
    if (!hasData) return 1;
    let max = 0;
    for (const { deltas } of deltaRows) {
      for (const col of numericColumns) {
        if (isLineActive(col.name)) max = Math.max(max, Math.abs(deltas[col.name] ?? 0));
      }
    }
    return max || 1;
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  }, [deltaRows, numericColumns, hasData, isLineActive]);

  const getX = (i: number) =>
    deltaRows.length <= 1 ? pad.left + cw / 2 : pad.left + (i / (deltaRows.length - 1)) * cw;

  const getY = (v: number) => pad.top + ch / 2 - (v / yExtent) * (ch / 2);
  const zeroY = pad.top + ch / 2;

  const formatNum = (v: number) =>
    v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(v % 1 === 0 ? 0 : 2);

  useEffect(() => {
    if (!tooltipRef.current || !mousePos || !width || !height) return;
    const t = tooltipRef.current;
    let left = mousePos.x - t.offsetWidth / 2;
    if (left < 0) left = 0;
    if (left + t.offsetWidth > width) left = width - t.offsetWidth;
    let top = mousePos.y + 15;
    if (top + t.offsetHeight > height - pad.bottom) top = mousePos.y - 15 - t.offsetHeight;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
    t.style.opacity = '1';
  }, [mousePos, width, height]);

  return (
    <div className="flex flex-col h-full w-full">
      {!hideLegend && hasData && (
        <div className="h-8 border-b border-[var(--los-border)] flex items-center justify-end px-2 gap-3 shrink-0 overflow-x-auto scrollbar-hide">
          {numericColumns.map((col, i) => (
            <button
              key={col.name}
              type="button"
              onClick={() =>
                setSelectedLines((prev) => {
                  if (prev.length === 0) return [col.name];
                  if (prev.includes(col.name)) {
                    const next = prev.filter((n) => n !== col.name);
                    return next;
                  }
                  return [...prev, col.name];
                })
              }
              className="flex items-center gap-1.5 hover:opacity-100 transition-opacity whitespace-nowrap"
              style={{ opacity: isLineActive(col.name) ? 1 : 0.4 }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-[9px] font-mono text-[var(--los-muted)]">{col.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 w-full min-h-[200px] relative" ref={containerRef}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: chart mouse tracking */}
        <div
          className="absolute inset-0"
          ref={chartRef}
          onMouseLeave={() => {
            setHoveredIndex(null);
            setMousePos(null);
          }}
        >
          {!hasData || !width || !height ? (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--los-muted)] text-xs font-mono">
              Need at least 2 rows to show deltas
            </div>
          ) : (
            <>
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative chart */}
              <svg
                width={width}
                height={height}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left - pad.left;
                  const idx = Math.min(
                    Math.max(Math.round((x / cw) * (deltaRows.length - 1)), 0),
                    deltaRows.length - 1,
                  );
                  setHoveredIndex(idx);
                  setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
              >
                {/* Y axis ticks: +max, 0, -max */}
                {[yExtent, yExtent / 2, 0, -yExtent / 2, -yExtent].map((v) => {
                  const y = getY(v);
                  return (
                    <g key={v}>
                      <line
                        x1={pad.left}
                        y1={y}
                        x2={width - pad.right}
                        y2={y}
                        stroke={v === 0 ? 'var(--los-muted)' : 'var(--los-border)'}
                        strokeDasharray={v === 0 ? undefined : '3 3'}
                        strokeOpacity={v === 0 ? 0.6 : 0.4}
                      />
                      <text
                        x={pad.left - 4}
                        y={y + 3}
                        textAnchor="end"
                        fill="var(--los-muted)"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        {formatNum(v)}
                      </text>
                    </g>
                  );
                })}

                {/* X axis labels: first and last */}
                {deltaRows.length > 1 && (
                  <>
                    <text
                      x={pad.left}
                      y={height - 6}
                      fill="var(--los-muted)"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {labels[0]}
                    </text>
                    <text
                      x={width - pad.right}
                      y={height - 6}
                      textAnchor="end"
                      fill="var(--los-muted)"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {labels[labels.length - 1]}
                    </text>
                  </>
                )}

                {/* Lines */}
                {numericColumns.map((col, i) => {
                  if (!isLineActive(col.name)) return null;
                  const pts = deltaRows
                    .map(
                      (dr, idx) =>
                        `${idx === 0 ? 'M' : 'L'}${getX(idx).toFixed(1)},${getY(dr.deltas[col.name] ?? 0).toFixed(1)}`,
                    )
                    .join(' ');
                  return (
                    <path
                      key={col.name}
                      d={pts}
                      fill="none"
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth="1.5"
                    />
                  );
                })}

                {/* Zero line fill areas (subtle) */}
                {numericColumns.length === 1 &&
                  isLineActive(numericColumns[0]?.name) &&
                  (() => {
                    const col = numericColumns[0] as (typeof numericColumns)[0];
                    const pts = deltaRows
                      .map(
                        (dr, idx) =>
                          `${getX(idx).toFixed(1)},${getY(dr.deltas[col.name] ?? 0).toFixed(1)}`,
                      )
                      .join(' ');
                    const first = `${getX(0).toFixed(1)},${zeroY.toFixed(1)}`;
                    const last = `${getX(deltaRows.length - 1).toFixed(1)},${zeroY.toFixed(1)}`;
                    return (
                      <polygon
                        points={`${first} ${pts} ${last}`}
                        fill={COLORS[0]}
                        fillOpacity="0.08"
                      />
                    );
                  })()}

                {/* Hover line */}
                {hoveredIndex !== null && (
                  <line
                    x1={getX(hoveredIndex)}
                    y1={pad.top}
                    x2={getX(hoveredIndex)}
                    y2={height - pad.bottom}
                    stroke="var(--los-border)"
                  />
                )}

                {/* Hover dots */}
                {hoveredIndex !== null &&
                  numericColumns.map((col, i) => {
                    if (!isLineActive(col.name)) return null;
                    const v = deltaRows[hoveredIndex]?.deltas[col.name] ?? 0;
                    return (
                      <circle
                        key={col.name}
                        cx={getX(hoveredIndex)}
                        cy={getY(v)}
                        r="3"
                        fill="var(--los-bg)"
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth="2"
                      />
                    );
                  })}
              </svg>

              {/* Tooltip */}
              {hoveredIndex !== null && mousePos !== null && (
                <div
                  ref={tooltipRef}
                  className="absolute z-10 bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded shadow-xl pointer-events-none opacity-0 text-[10px] font-mono"
                >
                  <div className="text-[var(--los-muted)] mb-1">{labels[hoveredIndex]}</div>
                  {numericColumns.map((col, i) => {
                    if (!isLineActive(col.name)) return null;
                    const v = deltaRows[hoveredIndex]?.deltas[col.name] ?? 0;
                    return (
                      <div key={col.name} className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="text-[var(--los-muted)]">{col.name}:</span>
                        <span className={v >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {v >= 0 ? '+' : ''}
                          {formatNum(v)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Chart ───────────────────────────────────────────────────────────────

export const DataCollectionChart = ({
  data,
  width: propWidth,
  height: propHeight,
  hideLegend,
}: DataCollectionChartProps & { hideLegend?: boolean }) => {
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
    return data.columns.filter(
      (c) => c.type === 'number' || c.type === 'auto:number:sum' || c.type === 'auto:number:avg',
    );
  }, [data.columns]);

  // Identify X-Axis Column (Prefer 'created' or first date column)
  const xColumn = useMemo(() => {
    return (
      data.columns.find((c) => c.name === 'created') ||
      data.columns.find((c) => c.type.includes('date')) ||
      data.columns[0]
    );
  }, [data.columns]);

  // Toggle State for Lines (Empty means all selected)
  const [selectedLines, setSelectedLines] = useState<string[]>([]);

  const toggleLine = (name: string) => {
    setSelectedLines((prev) => {
      if (prev.length === 0) return [name];
      if (prev.includes(name)) {
        const next = prev.filter((n) => n !== name);
        return next;
      }
      return [...prev, name];
    });
  };

  const isLineActive = (name: string) => selectedLines.length === 0 || selectedLines.includes(name);

  // Prepare Grid Data
  // Sort rows by date if xColumn is date
  const sortedRows = useMemo(() => {
    const rows = [...data.rows];
    if (xColumn?.type.includes('date')) {
      rows.sort(
        (a, b) => parseDate(a[xColumn.name]).getTime() - parseDate(b[xColumn.name]).getTime(),
      );
    }
    return rows;
  }, [data.rows, xColumn]);

  // Chart Logic Validations
  const hasData = sortedRows.length > 0 && numericColumns.length > 0 && !!xColumn;

  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Y-Axis Ticks Calculation with "Nice Numbers"
  const tickValues = useMemo(() => {
    if (!hasData) return [40, 30, 20, 10, 0];
    let max = 0;
    sortedRows.forEach((row) => {
      numericColumns.forEach((col) => {
        if (isLineActive(col.name)) {
          const val = Number(row[col.name]) || 0;
          if (val > max) max = val;
        }
      });
    });

    if (max === 0) return [4, 3, 2, 1, 0];
    const targetTicks = 5;
    const roughStep = max / (targetTicks - 1);
    const mag = Math.floor(Math.log10(roughStep));
    const magPow = 10 ** mag;
    const magMsd = Math.ceil(roughStep / magPow);

    let niceStep = magMsd * magPow;
    if (magMsd > 5) niceStep = 10 * magPow;
    else if (magMsd > 2) niceStep = 5 * magPow;
    else if (magMsd > 1) niceStep = 2 * magPow;
    else niceStep = 1 * magPow;

    const niceMax = Math.ceil(max / niceStep) * niceStep;
    const numTicks = Math.round(niceMax / niceStep) + 1;
    return Array.from({ length: numTicks }, (_, i) => niceMax - i * niceStep);
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  }, [sortedRows, numericColumns, hasData, isLineActive]);

  const firstTick = tickValues[0];
  const yMax = firstTick !== undefined && firstTick > 0 ? firstTick : 10;

  // Scales
  const getX = (index: number) => {
    if (sortedRows.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (sortedRows.length - 1)) * chartWidth;
  };

  const getY = (val: number) => padding.top + chartHeight - (val / yMax) * chartHeight;

  // Path Generator
  const createPath = (colName: string) => {
    if (sortedRows.length === 0) return '';
    return sortedRows
      .map((row, i) => {
        const val = Number(row[colName]) || 0;
        return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`;
      })
      .join(' ');
  };

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tooltipRef.current || !mousePos || !width || !height) return;

    const tooltip = tooltipRef.current;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;

    const gap = 15;

    let left = mousePos.x - tooltipWidth / 2;
    if (left < 0) left = 0;
    if (left + tooltipWidth > width) left = width - tooltipWidth;

    let top = mousePos.y + gap;
    const xAxisY = height - padding.bottom;

    if (top + tooltipHeight > xAxisY) {
      top = mousePos.y - gap - tooltipHeight;
    }

    if (top < 0) top = 0;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.opacity = '1';
  }, [mousePos, width, height]);

  const handleMouseMove = (e: any) => {
    if (!hasData || !width || !height) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    const y = e.clientY - rect.top;
    const count = sortedRows.length;
    let index = 0;
    if (count > 1) {
      index = Math.min(Math.max(Math.round((x / chartWidth) * (count - 1)), 0), count - 1);
    }
    setHoveredIndex(index);
    setMousePos({ x: e.clientX - rect.left, y });
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Legend */}
      {!hideLegend && hasData && (
        <div className="h-8 border-b border-[var(--los-border)] flex items-center justify-end px-2 gap-3 shrink-0 overflow-x-auto scrollbar-hide">
          {numericColumns.map((col, i) => (
            <button
              key={col.name}
              type="button"
              onClick={() => toggleLine(col.name)}
              className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity whitespace-nowrap"
              style={{ opacity: isLineActive(col.name) ? 1 : 0.4 }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-[9px] font-mono text-[var(--los-muted)]">{col.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 w-full min-h-[200px] relative" ref={containerRef}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: chart mouse tracking */}
        <div
          className="absolute inset-0"
          ref={chartRef}
          onMouseLeave={() => {
            setHoveredIndex(null);
            setMousePos(null);
          }}
        >
          {!hasData || !width || !height ? (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--los-muted)]">
              No data to chart
            </div>
          ) : (
            <>
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon */}
              <svg width={width} height={height} onMouseMove={handleMouseMove}>
                {/* Grid Lines */}
                {tickValues.map((val) => {
                  const y = getY(val);
                  return (
                    <g key={val}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={width - padding.right}
                        y2={y}
                        stroke="var(--los-border)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 5}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[10px] fill-[var(--los-muted)] font-mono"
                      >
                        {formatNumber(val)}
                      </text>
                    </g>
                  );
                })}

                {/* X Axis */}
                {sortedRows.length > 1 && (
                  <>
                    <text
                      x={padding.left}
                      y={height - 5}
                      className="text-[9px] fill-[var(--los-muted)] font-mono"
                    >
                      {xColumn.type.includes('date')
                        ? parseDate(sortedRows[0]?.[xColumn.name]).toLocaleDateString(undefined, {
                            month: 'numeric',
                            day: 'numeric',
                          })
                        : sortedRows[0]?.[xColumn.name]}
                    </text>
                    <text
                      x={width - padding.right}
                      y={height - 5}
                      textAnchor="end"
                      className="text-[9px] fill-[var(--los-muted)] font-mono"
                    >
                      {xColumn.type.includes('date')
                        ? parseDate(
                            sortedRows[sortedRows.length - 1]?.[xColumn.name],
                          ).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
                        : sortedRows[sortedRows.length - 1]?.[xColumn.name]}
                    </text>
                  </>
                )}

                {/* Lines */}
                {numericColumns.map((col, i) => {
                  if (!isLineActive(col.name)) return null;
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
                    x1={getX(hoveredIndex)}
                    y1={padding.top}
                    x2={getX(hoveredIndex)}
                    y2={height - padding.bottom}
                    stroke="var(--los-border)"
                  />
                )}

                {/* Dots on Hover */}
                {hoveredIndex !== null &&
                  numericColumns.map((col, i) => {
                    if (!isLineActive(col.name)) return null;
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
                    );
                  })}
              </svg>

              {/* Tooltip */}
              {hoveredIndex !== null && mousePos !== null && (
                <div
                  ref={tooltipRef}
                  className="absolute z-10 bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded shadow-xl pointer-events-none opacity-0"
                >
                  <div className="text-[10px] text-[var(--los-muted)] font-mono mb-1">
                    {xColumn.type.includes('date')
                      ? parseDate(sortedRows[hoveredIndex]?.[xColumn.name]).toLocaleDateString()
                      : sortedRows[hoveredIndex]?.[xColumn.name]}
                  </div>
                  {numericColumns.map((col, i) => {
                    if (!isLineActive(col.name)) return null;
                    const val = Number(sortedRows[hoveredIndex]?.[col.name]);
                    return (
                      <div key={col.name} className="flex items-center gap-2 text-[10px] font-mono">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="text-[var(--los-muted)]">{col.name}:</span>
                        <span className="text-[var(--los-fg)]">
                          {Number.isNaN(val)
                            ? '-'
                            : val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
