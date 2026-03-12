import { useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoLabel, MonoText } from '../../Atoms/Typography';
import {
  addEntry,
  aggregateByPeriod,
  forecastYearEnd,
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

// ─── Mini SVG charts ──────────────────────────────────────────────────────────

interface LineChartProps {
  points: number[];
  width: number;
  height: number;
  color: string;
  label?: string;
}

const LineChart = ({ points, width, height, color, label }: LineChartProps) => {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = { top: 6, right: 4, bottom: label ? 20 : 6, left: 4 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const step = w / (points.length - 1);

  const pts = points
    .map((v, i) => `${pad.left + i * step},${pad.top + h - ((v - min) / range) * h}`)
    .join(' ');

  const lastX = pad.left + (points.length - 1) * step;
  const lastY = pad.top + h - (((points[points.length - 1] ?? 0) - min) / range) * h;

  return (
    <svg width={width} height={height} aria-label={label ?? 'line chart'} role="img">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
      {label && (
        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          fill="var(--los-muted)"
          fontSize="8"
          fontFamily="monospace"
        >
          {label}
        </text>
      )}
    </svg>
  );
};

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
        {/* Y grid */}
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

        {/* Bars */}
        {points.map((p, i) => {
          const groupX = pad.left + i * groupW + (groupW - barW * 3 - gap * 2) / 2;
          const valueH = (p.value / maxVal) * ch;
          const investH = (p.invest / maxVal) * ch;
          const profitH = p.profit > 0 ? (p.profit / maxVal) * ch : 0;
          const opacity = hovered !== null && hovered !== i ? 0.3 : 1;

          return (
            <g key={p.label} opacity={opacity}>
              {/* Invest bar */}
              <rect
                x={groupX}
                y={pad.top + ch - investH}
                width={barW}
                height={investH}
                fill="var(--los-muted)"
                opacity={0.6}
              />
              {/* Value bar */}
              <rect
                x={groupX + barW + gap}
                y={pad.top + ch - valueH}
                width={barW}
                height={valueH}
                fill="var(--los-accent)"
              />
              {/* Profit bar */}
              <rect
                x={groupX + barW * 2 + gap * 2}
                y={pad.top + ch - profitH}
                width={barW}
                height={profitH}
                fill={p.profit >= 0 ? '#4ade80' : '#f87171'}
              />
              {/* X label */}
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

      {/* Tooltip */}
      {hovered !== null && points[hovered] && (
        <div
          className="absolute pointer-events-none z-10 border border-[var(--los-border)] bg-[var(--los-bg)] p-2"
          style={{
            left: Math.min(pad.left + hovered * groupW + groupW, width - 120),
            top: pad.top,
          }}
        >
          <p className="text-[10px] font-mono text-[var(--los-muted)] mb-1">
            {points[hovered]?.label}
          </p>
          <p className="text-[10px] font-mono text-[var(--los-muted)]">
            Invest: {Math.round(points[hovered]?.invest ?? 0)}
          </p>
          <p className="text-[10px] font-mono text-[var(--los-accent)]">
            Value: {Math.round(points[hovered]?.value ?? 0)}
          </p>
          <p
            className={cn(
              'text-[10px] font-mono',
              (points[hovered]?.profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
            )}
          >
            Profit: {Math.round(points[hovered]?.profit ?? 0)}
          </p>
        </div>
      )}
    </div>
  );
};

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
  const formatNum = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  return (
    <svg width={width} height={height} role="img" aria-label="change chart">
      {/* Zero line */}
      <line
        x1={pad.left}
        y1={pad.top + mid}
        x2={width - pad.right}
        y2={pad.top + mid}
        stroke="var(--los-border)"
        strokeDasharray="3 3"
      />
      {/* Line */}
      <path d={ptsPath} fill="none" stroke="var(--los-accent)" strokeWidth="1.5" />
      {/* Points */}
      {pctValues.map((v, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: SVG chart points have no stable identity
          key={`p${i}`}
          cx={pad.left + i * step}
          cy={toY(v)}
          r="2"
          fill={v >= 0 ? '#4ade80' : '#f87171'}
        />
      ))}
      {/* X labels */}
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
      {/* Y label */}
      <text
        x={pad.left - 4}
        y={pad.top + mid + 3}
        textAnchor="end"
        fill="var(--los-muted)"
        fontSize="8"
        fontFamily="monospace"
      >
        {formatNum(0)}
      </text>
    </svg>
  );
};

// ─── Add Entry Form ───────────────────────────────────────────────────────────

interface AddFormProps {
  onAdd: (value: number, invest: number, date: Date) => void;
}

const AddForm = ({ onAdd }: AddFormProps) => {
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

// ─── Main Widget ──────────────────────────────────────────────────────────────

export const StocksWidget = ({ content, mode, onChange }: StocksWidgetProps) => {
  const [period, setPeriod] = useState<StockPeriod>('monthly');
  const [chartTab, setChartTab] = useState<'bars' | 'value' | 'change'>('bars');

  const entries = parseStocks(content);
  const stats = getStats(entries);
  const aggregated = aggregateByPeriod(entries, period);
  const forecast = forecastYearEnd(entries);

  const fmtNum = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  if (mode === 'ADD') {
    return (
      <div className="w-full h-full flex items-start justify-center overflow-y-auto custom-scrollbar">
        <AddForm
          onAdd={(value, invest, date) => {
            const newContent = addEntry(content, value, invest, date);
            onChange?.(newContent);
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
        <LineChart
          points={entries.slice(-24).map((e) => e.value)}
          width={120}
          height={40}
          color="var(--los-accent)"
        />
      </div>
    );
  }

  // FOCUS mode
  const PERIODS: StockPeriod[] = ['weekly', 'monthly', 'yearly'];
  const CHART_TABS = [
    { key: 'bars' as const, label: 'Overview' },
    { key: 'value' as const, label: 'Value' },
    { key: 'change' as const, label: 'Change' },
  ];

  const chartW = 640;
  const chartH = 260;

  return (
    <div className="flex flex-col gap-6 p-6 w-full h-full overflow-y-auto custom-scrollbar">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Current Value', value: fmtNum(stats.latestValue), accent: false },
            { label: 'Total Invested', value: fmtNum(stats.latestInvest), accent: false },
            {
              label: 'Total Profit',
              value: fmtNum(stats.latestProfit),
              accent: true,
              positive: stats.latestProfit >= 0,
            },
            {
              label: 'Return',
              value: fmtPct(stats.latestProfitPct),
              accent: true,
              positive: stats.latestProfitPct >= 0,
            },
          ].map(({ label, value, accent, positive }) => (
            <div key={label} className="border border-[var(--los-border)] p-3 flex flex-col gap-1">
              <MonoLabel className="text-[10px]">{label}</MonoLabel>
              <span
                className={cn(
                  'text-xl font-bold font-mono',
                  accent ? (positive ? 'text-green-400' : 'text-red-400') : 'text-[var(--los-fg)]',
                )}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Last change */}
      {stats?.changeVsPrev !== null && stats?.changeVsPrev !== undefined && (
        <div className="flex items-center gap-3 text-xs font-mono text-[var(--los-muted)]">
          <span>vs prev entry:</span>
          <span
            className={cn(stats.changeVsPrev >= 0 ? 'text-green-400' : 'text-red-400', 'font-bold')}
          >
            {stats.changeVsPrev >= 0 ? '+' : ''}
            {fmtNum(stats.changeVsPrev)} ({fmtPct(stats.changeVsPrevPct ?? 0)})
          </span>
        </div>
      )}

      {/* Forecast */}
      {forecast && (
        <div className="border border-[var(--los-border)] p-3 flex flex-col gap-1">
          <MonoLabel className="text-[10px]">
            Year-End Forecast ({new Date().getFullYear()})
          </MonoLabel>
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold font-mono text-[var(--los-accent)]">
              {fmtNum(forecast.yearEndValue)}
            </span>
            <span className="text-[10px] font-mono text-[var(--los-muted)]">
              R² = {forecast.r2.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Period selector */}
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

      {/* Chart tabs */}
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

      {/* Chart legend */}
      {chartTab === 'bars' && (
        <div className="flex gap-4 text-[9px] font-mono text-[var(--los-muted)]">
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-2 inline-block opacity-60"
              style={{ background: 'var(--los-muted)' }}
            />
            Invest
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 inline-block" style={{ background: 'var(--los-accent)' }} />
            Value
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 inline-block" style={{ background: '#4ade80' }} />
            Profit
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="w-full overflow-x-auto">
        {chartTab === 'bars' && (
          <GroupedBarChart points={aggregated} width={chartW} height={chartH} />
        )}
        {chartTab === 'value' && (
          <LineChart
            points={aggregated.map((p) => p.value)}
            width={chartW}
            height={chartH}
            color="var(--los-accent)"
          />
        )}
        {chartTab === 'change' && (
          <ChangeChart points={aggregated} width={chartW} height={chartH} />
        )}
        {aggregated.length === 0 && (
          <div className="flex items-center justify-center h-40 text-[var(--los-muted)] text-xs font-mono">
            No data for this period
          </div>
        )}
      </div>

      {/* Entry count */}
      <p className="text-[9px] font-mono text-[var(--los-muted)] opacity-50">
        {entries.length} entries · {aggregated.length} {period} periods
      </p>
    </div>
  );
};
