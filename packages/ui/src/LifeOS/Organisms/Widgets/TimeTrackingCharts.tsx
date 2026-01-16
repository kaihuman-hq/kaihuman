import { h, Fragment } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import {
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  CartesianGrid as RechartsCartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer as RechartsResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar as RechartsBar
} from 'recharts';
import { MonoHeader } from '../../Atoms/Typography';
import { parseTimeTracking, getChartData, TimeTrackingData } from './TimeTrackingLogic';
import { cn } from '../../../utils';

// Bypass Preact/React type mismatch for Recharts
const LineChart: any = RechartsLineChart;
const Line: any = RechartsLine;
const XAxis: any = RechartsXAxis;
const YAxis: any = RechartsYAxis;
const CartesianGrid: any = RechartsCartesianGrid;
const Tooltip: any = RechartsTooltip;
const ResponsiveContainer: any = RechartsResponsiveContainer;
const BarChart: any = RechartsBarChart;
const Bar: any = RechartsBar;

interface TimeTrackingChartsProps {
  data: string | TimeTrackingData;
}

export const TimeTrackingCharts = ({ data }: TimeTrackingChartsProps) => {
  const parsedData = useMemo(() => {
    return typeof data === 'string' ? parseTimeTracking(data) : data;
  }, [data]);

  const chartData = useMemo(() => getChartData(parsedData), [parsedData]);
  const [view, setView] = useState<'DAILY' | 'AGGREGATED'>('DAILY');
  const [aggregation, setAggregation] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded shadow-lg">
          <p className="text-[10px] font-mono text-[var(--los-muted)] mb-1">{label}</p>
          {payload.map((entry: any) => (
            <p key={entry.name} className="text-xs font-mono" style={{ color: entry.color }}>
              {entry.name}: {entry.value}h
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <MonoHeader className="text-lg">ANALYTICS</MonoHeader>
        <div className="flex gap-2">
          <div className="flex bg-[var(--los-border)] rounded-sm p-0.5">
            <button
              onClick={() => setView('DAILY')}
              className={cn(
                "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                view === 'DAILY' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
              )}
            >
              DAILY
            </button>
            <button
              onClick={() => setView('AGGREGATED')}
              className={cn(
                "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                view === 'AGGREGATED' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
              )}
            >
              AGGREGATED
            </button>
          </div>

          {view === 'AGGREGATED' && (
            <div className="flex bg-[var(--los-border)] rounded-sm p-0.5 animate-in fade-in slide-in-from-right-2">
              <button
                onClick={() => setAggregation('WEEKLY')}
                className={cn(
                  "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                  aggregation === 'WEEKLY' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                )}
              >
                WEEK
              </button>
              <button
                onClick={() => setAggregation('MONTHLY')}
                className={cn(
                  "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                  aggregation === 'MONTHLY' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                )}
              >
                MONTH
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full min-h-0 relative">
        <div className="absolute inset-0 pb-8">
          <ResponsiveContainer width="100%" height="100%">
            {view === 'DAILY' ? (
              <LineChart data={chartData.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--los-border)" vertical={false} opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--los-muted)', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fill: 'var(--los-muted)', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--los-border)', strokeWidth: 2 }} />
                <Line
                  type="monotone"
                  dataKey="workHours"
                  name="Work"
                  stroke="var(--los-accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="breakHours"
                  name="Breaks"
                  stroke="var(--los-muted)"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 4"
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            ) : (
              <BarChart data={aggregation === 'WEEKLY' ? chartData.weekly : chartData.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--los-border)" vertical={false} opacity={0.5} />
                <XAxis
                  dataKey={aggregation === 'WEEKLY' ? 'week' : 'month'}
                  tick={{ fill: 'var(--los-muted)', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--los-muted)', fontSize: 10, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--los-border)', opacity: 0.1 }} />
                <Bar
                  dataKey="hours"
                  name="Work"
                  fill="var(--los-accent)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend / Stats Footer */}
      <div className="h-8 border-t border-[var(--los-border)] flex items-center justify-end gap-4 shrink-0 text-[10px] text-[var(--los-muted)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-0.5 bg-[var(--los-accent)]" />
          <span>WORK HOURS</span>
        </div>
        {view === 'DAILY' && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-0.5 bg-[var(--los-muted)] border-t border-dashed" />
            <span>BREAKS</span>
          </div>
        )}
      </div>
    </div>
  );
};
