import { useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoLabel, MonoText } from '../../Atoms/Typography';
import {
  addEntry,
  aggregateByPeriod,
  buildPeriodForecast,
  type ForecastPoint,
  getStats,
  type PeriodPoint,
  parseStocks,
  type StockPeriod,
} from './StocksLogic';

export interface StocksWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ADD';
  onChange?: (newContent: string) => void;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fmtNum = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

// ─── Sparkline (SMALL mode) ───────────────────────────────────────────────────

const Sparkline = ({
  values,
  width,
  height,
}: {
  values: number[];
  width: number;
  height: number;
}) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--los-accent)" strokeWidth="1.5" />
    </svg>
  );
};

// ─── Combined Historical + Forecast line chart ────────────────────────────────

interface ForecastChartProps {
  historical: PeriodPoint[];
  forecast: ForecastPoint[];
  width: number;
  height: number;
}

const ForecastChart = ({ historical, forecast, width, height }: ForecastChartProps) => {
  const [hoveredIdx, setHoveredIdx] = useState<{ idx: number; isForecast: boolean } | null>(null);

  const allValues = [...historical.map((p) => p.value), ...forecast.map((p) => p.value)];
  if (allValues.length < 2) return null;

  const pad = { top: 12, right: 12, bottom: 28, left: 44 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const total = historical.length + forecast.length;

  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues) * 1.05;
  const range = maxV - minV || 1;

  const toX = (i: number) => pad.left + (i / (total - 1)) * cw;
  const toY = (v: number) => pad.top + ch - ((v - minV) / range) * ch;

  const yTicks = 4;
  const formatAxis = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1000
        ? `${(v / 1000).toFixed(0)}k`
        : String(Math.round(v));
  const labelStep = Math.max(Math.ceil(total / 10), 1);

  // Build SVG path for historical line
  const histPath = historical
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
    .join(' ');

  // Build SVG path for forecast line (starts where historical ends)
  const forecastPath = forecast
    .map((p, i) => {
      const xi = historical.length - 1 + i;
      return `${xi === historical.length - 1 ? 'M' : 'L'}${toX(xi).toFixed(1)},${toY(p.value).toFixed(1)}`;
    })
    .join(' ');

  // Divider X position
  const dividerX = historical.length > 0 ? toX(historical.length - 1) : null;

  // Hover tooltip data
  const hovered = hoveredIdx
    ? hoveredIdx.isForecast
      ? forecast[hoveredIdx.idx]
      : historical[hoveredIdx.idx]
    : null;
  const hoveredX = hoveredIdx
    ? toX(hoveredIdx.isForecast ? historical.length - 1 + hoveredIdx.idx : hoveredIdx.idx)
    : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: chart hover tracking
    <div className="relative" onMouseLeave={() => setHoveredIdx(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="forecast chart"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - pad.left;
          const rawIdx = Math.round((x / cw) * (total - 1));
          const idx = Math.max(0, Math.min(total - 1, rawIdx));
          if (idx < historical.length) {
            setHoveredIdx({ idx, isForecast: false });
          } else {
            setHoveredIdx({ idx: idx - (historical.length - 1), isForecast: true });
          }
        }}
      >
        {/* Y grid */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = minV + (range / yTicks) * (yTicks - i);
          const y = toY(v);
          return (
            <g key={`yt-${Math.round(v)}`}>
              <line
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke="var(--los-border)"
                strokeOpacity={0.4}
                strokeDasharray="3 3"
              />
              <text
                x={pad.left - 4}
                y={y + 3}
                textAnchor="end"
                fill="var(--los-muted)"
                fontSize="8"
                fontFamily="monospace"
              >
                {formatAxis(v)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {[...historical, ...forecast].map((p, i) => {
          if (i % labelStep !== 0 && i !== total - 1) return null;
          const isForecast = i >= historical.length;
          return (
            <text
              key={`xl-${isForecast ? 'f' : 'h'}-${p.label}`}
              x={toX(i)}
              y={height - 6}
              textAnchor="middle"
              fill={isForecast ? '#f59e0b' : 'var(--los-muted)'}
              fontSize="8"
              fontFamily="monospace"
              opacity={isForecast ? 0.8 : 1}
            >
              {p.label}
            </text>
          );
        })}

        {/* Historical line */}
        <path d={histPath} fill="none" stroke="var(--los-accent)" strokeWidth="1.5" />

        {/* Forecast line — dashed amber */}
        {forecast.length > 0 && (
          <path
            d={forecastPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
        )}

        {/* Divider: today boundary */}
        {dividerX !== null && forecast.length > 0 && (
          <line
            x1={dividerX}
            y1={pad.top}
            x2={dividerX}
            y2={height - pad.bottom}
            stroke="var(--los-muted)"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
        )}

        {/* Hover marker */}
        {hoveredX !== null && hovered && (
          <line
            x1={hoveredX}
            y1={pad.top}
            x2={hoveredX}
            y2={height - pad.bottom}
            stroke="var(--los-fg)"
            strokeOpacity={0.3}
          />
        )}
      </svg>

      {/* Tooltip */}
      {hovered && hoveredX !== null && (
        <div
          className="absolute pointer-events-none z-10 border border-[var(--los-border)] bg-[var(--los-bg)] p-2 text-[10px] font-mono"
          style={{
            left: Math.min(hoveredX + 8, width - 120),
            top: pad.top,
          }}
        >
          <p
            className={cn(
              'mb-1',
              hoveredIdx?.isForecast ? 'text-amber-400' : 'text-[var(--los-muted)]',
            )}
          >
            {hovered.label}
            {hoveredIdx?.isForecast ? ' (forecast)' : ''}
          </p>
          <p className="text-[var(--los-accent)]">{fmtNum(hovered.value)}</p>
          {'invest' in hovered && (hovered as PeriodPoint).invest > 0 && (
            <p className="text-[var(--los-muted)]">
              invest: {fmtNum((hovered as PeriodPoint).invest)}
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      {forecast.length > 0 && (
        <div className="flex gap-4 mt-2 text-[9px] font-mono text-[var(--los-muted)]">
          <span className="flex items-center gap-1">
            <span
              className="w-5 h-px inline-block"
              style={{ background: 'var(--los-accent)', display: 'inline-block', height: '2px' }}
            />
            Historical
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 inline-block border-t-2 border-amber-400 border-dashed" />
            Forecast
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Grouped bar chart ────────────────────────────────────────────────────────

interface GroupedBarChartProps {
  points: PeriodPoint[];
  width: number;
  height: number;
}

const GroupedBarChart = ({ points, width, height }: GroupedBarChartProps) => {
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) return null;

  const pad = { top: 10, right: 8, bottom: 24, left: 40 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const maxVal = Math.max(...points.flatMap((p) => [p.value, p.invest]), 1);
  const groupW = cw / points.length;
  const barW = Math.max((groupW * 0.8) / 3, 2);
  const gap = barW * 0.2;

  const yTicks = 4;
  const formatNum = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v));
  const labelStep = Math.max(Math.ceil(points.length / 10), 1);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: chart hover tracking
    <div className="relative" onMouseLeave={() => setHovered(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="grouped bar chart"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - pad.left;
          const idx = Math.floor((x / cw) * points.length);
          setHovered(idx >= 0 && idx < points.length ? idx : null);
        }}
      >
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = pad.top + (ch / yTicks) * i;
          const val = maxVal - (maxVal / yTicks) * i;
          return (
            <g key={`ytick-${val}`}>
              <line
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke="var(--los-border)"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
              {i < yTicks && (
                <text
                  x={pad.left - 4}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--los-muted)"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {formatNum(val)}
                </text>
              )}
            </g>
          );
        })}

        {points.map((p, i) => {
          const groupX = pad.left + i * groupW + (groupW - barW * 3 - gap * 2) / 2;
          const valueH = (p.value / maxVal) * ch;
          const investH = (p.invest / maxVal) * ch;
          const profitH = p.profit > 0 ? (p.profit / maxVal) * ch : 0;
          const opacity = hovered !== null && hovered !== i ? 0.3 : 1;

          return (
            <g key={p.label} opacity={opacity}>
              <rect
                x={groupX}
                y={pad.top + ch - investH}
                width={barW}
                height={investH}
                fill="var(--los-muted)"
                opacity={0.6}
              />
              <rect
                x={groupX + barW + gap}
                y={pad.top + ch - valueH}
                width={barW}
                height={valueH}
                fill="var(--los-accent)"
              />
              <rect
                x={groupX + barW * 2 + gap * 2}
                y={pad.top + ch - profitH}
                width={barW}
                height={profitH}
                fill={p.profit >= 0 ? '#4ade80' : '#f87171'}
              />
              {(i % labelStep === 0 || i === points.length - 1) && (
                <text
                  x={groupX + (barW * 3 + gap * 2) / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fill="var(--los-muted)"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered !== null && points[hovered] && (
        <div
          className="absolute pointer-events-none z-10 border border-[var(--los-border)] bg-[var(--los-bg)] p-2 text-[10px] font-mono"
          style={{
            left: Math.min(pad.left + hovered * groupW + groupW, width - 120),
            top: pad.top,
          }}
        >
          <p className="text-[var(--los-muted)] mb-1">{points[hovered]?.label}</p>
          <p className="text-[var(--los-muted)]">Invest: {fmtNum(points[hovered]?.invest ?? 0)}</p>
          <p className="text-[var(--los-accent)]">Value: {fmtNum(points[hovered]?.value ?? 0)}</p>
          <p
            className={cn(
              '',
              (points[hovered]?.profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
            )}
          >
            Profit: {fmtNum(points[hovered]?.profit ?? 0)}
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Period change chart ──────────────────────────────────────────────────────

interface ChangeChartProps {
  points: PeriodPoint[];
  width: number;
  height: number;
}

const ChangeChart = ({ points, width, height }: ChangeChartProps) => {
  if (points.length < 2) return null;

  const pad = { top: 10, right: 8, bottom: 24, left: 40 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const pctValues = points.map((p) => p.profitPct ?? 0);
  const minP = Math.min(...pctValues);
  const maxP = Math.max(...pctValues);
  const range = maxP - minP || 1;
  const mid = ch * (maxP / range);

  const step = cw / (points.length - 1);
  const toY = (v: number) => pad.top + ch - ((v - minP) / range) * ch;
  const ptsPath = pctValues
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad.left + i * step} ${toY(v)}`)
    .join(' ');
  const labelStep = Math.max(Math.ceil(points.length / 10), 1);

  return (
    <svg width={width} height={height} role="img" aria-label="change chart">
      <line
        x1={pad.left}
        y1={pad.top + mid}
        x2={width - pad.right}
        y2={pad.top + mid}
        stroke="var(--los-border)"
        strokeDasharray="3 3"
      />
      <path d={ptsPath} fill="none" stroke="var(--los-accent)" strokeWidth="1.5" />
      {pctValues.map((v, i) => (
        <circle
          key={`pct-${points[i]?.label ?? i}`}
          cx={pad.left + i * step}
          cy={toY(v)}
          r="2"
          fill={v >= 0 ? '#4ade80' : '#f87171'}
        />
      ))}
      {points.map((p, i) => {
        if (i % labelStep !== 0 && i !== points.length - 1) return null;
        return (
          <text
            key={p.label}
            x={pad.left + i * step}
            y={height - 6}
            textAnchor="middle"
            fill="var(--los-muted)"
            fontSize="8"
            fontFamily="monospace"
          >
            {p.label}
          </text>
        );
      })}
      <text
        x={pad.left - 4}
        y={pad.top + mid + 3}
        textAnchor="end"
        fill="var(--los-muted)"
        fontSize="8"
        fontFamily="monospace"
      >
        0%
      </text>
    </svg>
  );
};

// ─── Add Entry Form ───────────────────────────────────────────────────────────

const AddForm = ({ onAdd }: { onAdd: (value: number, invest: number, date: Date) => void }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [dateStr, setDateStr] = useState(today);
  const [valueStr, setValueStr] = useState('');
  const [investStr, setInvestStr] = useState('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const value = Number.parseFloat(valueStr);
    const invest = Number.parseFloat(investStr || '0');
    if (Number.isNaN(value)) return;
    onAdd(value, Number.isNaN(invest) ? 0 : invest, new Date(dateStr));
    setValueStr('');
    setInvestStr('');
    setDateStr(today);
  };

  const inputCls =
    'w-full bg-transparent border border-[var(--los-border)] font-mono text-xs text-[var(--los-fg)] px-3 py-2 focus:outline-none focus:border-[var(--los-accent)]';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm w-full p-4">
      <MonoLabel>Add Stock Entry</MonoLabel>
      <div className="flex flex-col gap-1">
        <MonoText className="text-[10px] text-[var(--los-muted)]">Date</MonoText>
        <input
          type="date"
          className={inputCls}
          value={dateStr}
          onInput={(e) => setDateStr((e.target as HTMLInputElement).value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <MonoText className="text-[10px] text-[var(--los-muted)]">Current Value</MonoText>
        <input
          type="number"
          step="any"
          placeholder="e.g. 12500"
          className={inputCls}
          value={valueStr}
          onInput={(e) => setValueStr((e.target as HTMLInputElement).value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <MonoText className="text-[10px] text-[var(--los-muted)]">Total Invested</MonoText>
        <input
          type="number"
          step="any"
          placeholder="e.g. 10000"
          className={inputCls}
          value={investStr}
          onInput={(e) => setInvestStr((e.target as HTMLInputElement).value)}
        />
      </div>
      <button
        type="submit"
        className="border border-[var(--los-accent)] text-[var(--los-accent)] font-mono text-xs uppercase tracking-widest px-4 py-2 hover:bg-[var(--los-accent)] hover:text-black transition-colors"
      >
        Add Entry
      </button>
    </form>
  );
};

// ─── Stat tile ────────────────────────────────────────────────────────────────

const StatTile = ({
  label,
  value,
  sub,
  positive,
  neutral,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  neutral?: boolean;
}) => (
  <div className="border border-[var(--los-border)] p-3 flex flex-col gap-1">
    <MonoLabel className="text-[10px]">{label}</MonoLabel>
    <span
      className={cn(
        'text-xl font-bold font-mono leading-none',
        neutral
          ? 'text-[var(--los-fg)]'
          : positive === true
            ? 'text-green-400'
            : positive === false
              ? 'text-red-400'
              : 'text-[var(--los-fg)]',
      )}
    >
      {value}
    </span>
    {sub && <span className="text-[9px] font-mono text-[var(--los-muted)]">{sub}</span>}
  </div>
);

// ─── Main Widget ──────────────────────────────────────────────────────────────

export const StocksWidget = ({ content, mode, onChange }: StocksWidgetProps) => {
  const [period, setPeriod] = useState<StockPeriod>('monthly');
  const [chartTab, setChartTab] = useState<'bars' | 'value' | 'change' | 'forecast'>('bars');

  const entries = parseStocks(content);
  const stats = getStats(entries);
  const aggregated = aggregateByPeriod(entries, period);
  const periodForecast = buildPeriodForecast(aggregated, period);

  if (mode === 'ADD') {
    return (
      <div className="w-full h-full flex items-start justify-center overflow-y-auto custom-scrollbar">
        <AddForm
          onAdd={(value, invest, date) => {
            onChange?.(addEntry(content, value, invest, date));
          }}
        />
      </div>
    );
  }

  if (mode === 'SMALL') {
    if (!stats) {
      return (
        <div className="flex items-center justify-center h-full text-[var(--los-muted)] text-xs font-mono">
          No data
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 p-2">
        <span
          className={cn(
            'text-2xl font-bold font-mono leading-none',
            stats.latestProfit >= 0 ? 'text-[var(--los-fg)]' : 'text-red-400',
          )}
        >
          {fmtNum(stats.latestValue)}
        </span>
        <span className="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-wider">
          Current Value
        </span>
        {stats.changeVsPrevPct !== null && (
          <span
            className={cn(
              'text-[10px] font-mono',
              stats.changeVsPrevPct >= 0 ? 'text-green-400' : 'text-red-400',
            )}
          >
            {fmtPct(stats.changeVsPrevPct)}
          </span>
        )}
        <Sparkline values={entries.slice(-24).map((e) => e.value)} width={120} height={40} />
      </div>
    );
  }

  // ── FOCUS mode ──────────────────────────────────────────────────────────────

  const PERIODS: StockPeriod[] = ['weekly', 'monthly', 'yearly'];
  const CHART_TABS = [
    { key: 'bars' as const, label: 'Overview' },
    { key: 'value' as const, label: 'Value' },
    { key: 'change' as const, label: 'Change' },
    { key: 'forecast' as const, label: 'Forecast' },
  ];
  const chartW = 660;
  const chartH = 260;

  return (
    <div className="flex flex-col gap-6 p-6 w-full h-full overflow-y-auto custom-scrollbar">
      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Current Value" value={fmtNum(stats.latestValue)} neutral />
          <StatTile label="Total Invested" value={fmtNum(stats.latestInvest)} neutral />
          <StatTile
            label="Total Profit"
            value={fmtNum(stats.latestProfit)}
            sub={fmtPct(stats.latestProfitPct)}
            positive={stats.latestProfit >= 0}
          />
          {stats.cagr !== null ? (
            <StatTile
              label="CAGR"
              value={fmtPct(stats.cagr)}
              sub="compound annual"
              positive={stats.cagr >= 0}
            />
          ) : (
            <StatTile
              label="Return"
              value={fmtPct(stats.latestProfitPct)}
              positive={stats.latestProfitPct >= 0}
            />
          )}
        </div>
      )}

      {/* ── Secondary stats row ─────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.changeVsPrev !== null && (
            <StatTile
              label="Last Entry Δ"
              value={`${stats.changeVsPrev >= 0 ? '+' : ''}${fmtNum(stats.changeVsPrev)}`}
              sub={stats.changeVsPrevPct !== null ? fmtPct(stats.changeVsPrevPct) : undefined}
              positive={stats.changeVsPrev >= 0}
            />
          )}
          <StatTile
            label="All-Time High"
            value={fmtNum(stats.allTimeHigh)}
            sub={stats.drawdownPct < 0 ? `${fmtPct(stats.drawdownPct)} drawdown` : 'at ATH'}
            positive={stats.drawdownPct >= -1}
          />
          {periodForecast && (
            <StatTile
              label={`Avg ${period} growth`}
              value={fmtPct(periodForecast.avgGrowthPct)}
              sub={`from last ${period === 'weekly' ? '52w' : period === 'monthly' ? '24mo' : 'all'}`}
              positive={periodForecast.avgGrowthPct >= 0}
            />
          )}
          {periodForecast?.yearEndValue !== null && periodForecast?.yearEndValue !== undefined && (
            <StatTile
              label={`Projected year-end (${new Date().getFullYear()})`}
              value={fmtNum(periodForecast.yearEndValue)}
              sub={
                periodForecast.yearEndProfit !== null
                  ? `profit ${fmtNum(periodForecast.yearEndProfit)}`
                  : undefined
              }
              positive={periodForecast.yearEndValue >= (stats?.latestValue ?? 0)}
            />
          )}
        </div>
      )}

      {/* ── Period selector ────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'text-[10px] font-mono uppercase tracking-widest px-3 py-1 border transition-colors',
              period === p
                ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)]',
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Chart tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b border-[var(--los-border)] pb-2">
        {CHART_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setChartTab(key)}
            className={cn(
              'text-[10px] font-mono uppercase tracking-widest px-3 py-1 transition-colors',
              chartTab === key
                ? 'text-[var(--los-accent)] border-b-2 border-[var(--los-accent)] -mb-[2px]'
                : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Chart area ─────────────────────────────────────────────────────── */}
      <div className="w-full overflow-x-auto">
        {chartTab === 'bars' && (
          <>
            <div className="flex gap-4 mb-3 text-[9px] font-mono text-[var(--los-muted)]">
              <span className="flex items-center gap-1">
                <span className="w-3 h-[2px] inline-block opacity-60 bg-[var(--los-muted)]" />
                Invest
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-[2px] inline-block bg-[var(--los-accent)]" />
                Value
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-[2px] inline-block bg-green-400" />
                Profit
              </span>
            </div>
            <GroupedBarChart points={aggregated} width={chartW} height={chartH} />
          </>
        )}
        {chartTab === 'value' && (
          <ForecastChart historical={aggregated} forecast={[]} width={chartW} height={chartH} />
        )}
        {chartTab === 'change' && (
          <ChangeChart points={aggregated} width={chartW} height={chartH} />
        )}
        {chartTab === 'forecast' && periodForecast && (
          <div className="flex flex-col gap-4">
            <ForecastChart
              historical={aggregated}
              forecast={periodForecast.forecastPoints}
              width={chartW}
              height={chartH}
            />

            {/* Forecast table */}
            {periodForecast.forecastPoints.length > 0 && (
              <div className="border border-[var(--los-border)] overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="border-b border-[var(--los-border)]">
                      <th className="text-left px-3 py-2 text-[var(--los-muted)] font-normal">
                        Period
                      </th>
                      <th className="text-right px-3 py-2 text-[var(--los-muted)] font-normal">
                        Projected Value
                      </th>
                      <th className="text-right px-3 py-2 text-[var(--los-muted)] font-normal">
                        vs Current
                      </th>
                      <th className="text-right px-3 py-2 text-[var(--los-muted)] font-normal">
                        Projected Profit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodForecast.forecastPoints.map((fp, i) => {
                      const deltaVsCurrent = stats ? fp.value - stats.latestValue : null;
                      const projProfit = stats ? fp.value - stats.latestInvest : null;
                      return (
                        <tr
                          key={fp.label}
                          className={cn(
                            'border-b border-[var(--los-border)]/50',
                            i === periodForecast.forecastPoints.length - 1 && 'font-bold',
                          )}
                        >
                          <td className="px-3 py-1.5 text-amber-400">{fp.label}</td>
                          <td className="px-3 py-1.5 text-right text-[var(--los-fg)]">
                            {fmtNum(fp.value)}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-1.5 text-right',
                              deltaVsCurrent !== null && deltaVsCurrent >= 0
                                ? 'text-green-400'
                                : 'text-red-400',
                            )}
                          >
                            {deltaVsCurrent !== null
                              ? `${deltaVsCurrent >= 0 ? '+' : ''}${fmtNum(deltaVsCurrent)}`
                              : '—'}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-1.5 text-right',
                              projProfit !== null && projProfit >= 0
                                ? 'text-green-400'
                                : 'text-red-400',
                            )}
                          >
                            {projProfit !== null ? fmtNum(projProfit) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Forecast model info */}
            <p className="text-[9px] font-mono text-[var(--los-muted)] opacity-60">
              Linear trend · {periodForecast.periodsRemaining} periods remaining · R² ={' '}
              {periodForecast.r2.toFixed(2)} · lookback{' '}
              {period === 'weekly' ? '52w' : period === 'monthly' ? '24mo' : 'all'}
            </p>
          </div>
        )}
        {chartTab === 'forecast' && !periodForecast && (
          <div className="flex items-center justify-center h-40 text-[var(--los-muted)] text-xs font-mono">
            Need at least 2 periods of data to build a forecast
          </div>
        )}
        {chartTab !== 'forecast' && aggregated.length === 0 && (
          <div className="flex items-center justify-center h-40 text-[var(--los-muted)] text-xs font-mono">
            No data for this period
          </div>
        )}
      </div>

      <p className="text-[9px] font-mono text-[var(--los-muted)] opacity-40">
        {entries.length} entries · {aggregated.length} {period} periods
      </p>
    </div>
  );
};
