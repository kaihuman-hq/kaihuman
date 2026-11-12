import { useState } from 'react';
import { View } from 'react-native';
import {
  addStockValue,
  axisLabels,
  barGroups,
  changeValues,
  FORECAST_LOOKBACK,
  forecastChart,
  forecastRows,
  type StockChart,
  type StockPeriod,
  type StocksView,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, haptics, SegmentedControl, Text, TextField } from '../../ui/index.js';
import type { AddFormProps, Ctx } from './bodies.js';
import { GroupedBars, LineChart, Swatch } from './chart-parts.js';
import { EmptyLine, FormButtons, ItemRow, Rows, Stat, StatRow } from './parts.js';

const num = (n: number, digits = 2) => n.toFixed(digits);
const signed = (n: number, digits = 2) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
/** Short figure for tables, as the web's `fmtNum`: `12.3k` from a thousand up. */
const short = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));

const PERIODS: readonly { value: StockPeriod; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
];

const CHARTS: readonly { value: StockChart; label: string }[] = [
  { value: 'bars', label: 'Bars' },
  { value: 'value', label: 'Value' },
  { value: 'change', label: 'Change' },
  { value: 'forecast', label: 'Forecast' },
];

// Forecast is amber on the web too; the rest follow the theme.
const FORECAST = '#f59e0b';
const POSITIVE = '#4ade80';

function Legend({ items }: { items: readonly { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Swatch color={i.color} />
          <Text variant="caption2" tone="secondary">
            {i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Charts({
  view,
  period,
  chart,
  now,
}: {
  view: StocksView;
  period: StockPeriod;
  chart: StockChart;
  now: Date;
}) {
  const { colors } = useTheme();
  const points = view.periods[period];
  const forecast = view.forecasts[period];
  if (points.length === 0) return <EmptyLine>No data for this period.</EmptyLine>;
  if (chart === 'bars') {
    const groups = barGroups(points);
    const palette = [colors.secondaryLabel, colors.accent, POSITIVE];
    return (
      <View style={{ gap: 8 }}>
        <Legend
          items={[
            { label: 'Invest', color: palette[0] as string },
            { label: 'Value', color: palette[1] as string },
            { label: 'Profit', color: palette[2] as string },
          ]}
        />
        <GroupedBars
          testID="stocks-bars"
          label={`Invested, value and profit per ${period.replace('ly', '')}`}
          groups={groups}
          colors={palette}
        />
        {points.length > groups.length ? (
          <Text variant="caption2" tone="secondary">
            {`Latest ${groups.length} of ${points.length} periods`}
          </Text>
        ) : null}
      </View>
    );
  }
  if (chart === 'value') {
    return (
      <LineChart
        testID="stocks-value"
        label={`Value per ${period.replace('ly', '')}`}
        xLabels={axisLabels(points.map((p) => p.label))}
        series={[
          { key: 'value', color: colors.accent, values: points.map((p) => p.value), area: true },
        ]}
      />
    );
  }
  if (chart === 'change') {
    if (points.length < 2)
      return <EmptyLine>Need at least 2 periods for a change chart.</EmptyLine>;
    return (
      <LineChart
        testID="stocks-change"
        label={`Change versus the previous ${period.replace('ly', '')}, percent`}
        zeroLine
        xLabels={axisLabels(points.map((p) => p.label))}
        series={[{ key: 'change', color: colors.accent, values: changeValues(points), dots: true }]}
      />
    );
  }
  if (!forecast) return <EmptyLine>Need at least 2 periods of data to build a forecast.</EmptyLine>;
  const data = forecastChart(points, forecast);
  const rows = forecastRows(forecast, view.latestValue, view.invested);
  return (
    <View style={{ gap: 10 }}>
      <Legend
        items={[
          { label: 'Value', color: colors.accent },
          { label: 'Forecast', color: FORECAST },
        ]}
      />
      <LineChart
        testID="stocks-forecast"
        label={`Value and forecast per ${period.replace('ly', '')}`}
        xLabels={axisLabels(data.labels)}
        series={[
          { key: 'value', color: colors.accent, values: data.history },
          { key: 'forecast', color: FORECAST, values: data.projected, dashed: true },
        ]}
      />
      {rows.length > 0 ? (
        <Rows>
          {rows.map((r, i) => (
            <ItemRow
              key={r.label}
              testID={`forecast-${i}`}
              title={r.label}
              subtitle={`Profit ${signed(r.profit, 0)}`}
              trailing={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="subheadline" mono style={{ fontVariant: ['tabular-nums'] }}>
                    {short(r.value)}
                  </Text>
                  <Text variant="caption2" mono tone={r.vsCurrent >= 0 ? 'success' : 'danger'}>
                    {`${r.vsCurrent >= 0 ? '+' : ''}${short(r.vsCurrent)}`}
                  </Text>
                </View>
              }
            />
          ))}
        </Rows>
      ) : null}
      <Text variant="caption2" tone="secondary">
        {`Linear trend · ${forecast.periodsRemaining} periods remaining · R² = ${forecast.r2.toFixed(2)} · lookback ${FORECAST_LOOKBACK[period]} · until ${now.getFullYear()}`}
      </Text>
    </View>
  );
}

export function StockAddForm({ ctx, onDone }: AddFormProps) {
  const [value, setValue] = useState('');
  const [invest, setInvest] = useState('');
  const [date, setDate] = useState('');
  const save = () => {
    if (ctx.apply(addStockValue(ctx.content, value, invest, date, ctx.now))) {
      haptics.success();
      onDone();
    } else haptics.error();
  };
  return (
    <>
      <TextField
        label="Current value"
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        autoFocus
      />
      <TextField
        label="Invested this period"
        value={invest}
        onChangeText={setInvest}
        keyboardType="decimal-pad"
        placeholder="0"
      />
      <TextField
        label="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        placeholder="Today"
        autoCapitalize="none"
      />
      <FormButtons saveLabel="Save value" onSave={save} onCancel={onDone} />
    </>
  );
}

export function Stocks({ view, ctx }: { view: StocksView | null; ctx: Ctx }) {
  const [period, setPeriod] = useState<StockPeriod>('monthly');
  const [chart, setChart] = useState<StockChart>('bars');
  const [all, setAll] = useState(false);
  if (!view) {
    return <EmptyLine>No stock data.</EmptyLine>;
  }
  const up = view.profit >= 0;
  const points = view.periods[period];
  const forecast = view.forecasts[period];
  const newest = [...points].reverse();
  const shown = all ? newest : newest.slice(0, 6);
  return (
    <>
      <View style={{ gap: 2 }}>
        <Text
          variant="caption2"
          tone="secondary"
          weight="600"
          style={{ textTransform: 'uppercase' }}
        >
          Value
        </Text>
        <Text variant="largeTitle" mono style={{ fontVariant: ['tabular-nums'] }}>
          {num(view.latestValue)}
        </Text>
        <Text
          variant="subheadline"
          mono
          tone={up ? 'success' : 'danger'}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {`${up ? '▲' : '▼'} ${signed(view.profit)} (${signed(view.profitPct, 1)}%)`}
        </Text>
      </View>
      <StatRow>
        <Stat label="Invested" value={num(view.invested)} />
        <Stat label="Profit" value={signed(view.profit)} tone={up ? 'success' : 'danger'} />
        {view.changeVsPrev !== null ? (
          <Stat
            label="Vs last"
            value={signed(view.changeVsPrev)}
            tone={view.changeVsPrev >= 0 ? 'success' : 'danger'}
          />
        ) : null}
        <Stat label="All-time high" value={num(view.allTimeHigh)} />
        <Stat label="Below peak" value={`${num(Math.abs(view.drawdownPct), 1)}%`} />
        {view.cagr !== null ? <Stat label="CAGR" value={`${signed(view.cagr, 1)}%`} /> : null}
        {forecast ? (
          <Stat
            label={`Avg ${period.replace('ly', '')} growth`}
            value={`${signed(forecast.avgGrowthPct, 1)}%`}
            tone={forecast.avgGrowthPct >= 0 ? 'success' : 'danger'}
          />
        ) : null}
        {forecast?.yearEndValue != null ? (
          <Stat
            label={`Projected year-end`}
            value={num(forecast.yearEndValue, 0)}
            unit={
              forecast.yearEndProfit !== null
                ? `profit ${num(forecast.yearEndProfit, 0)}`
                : undefined
            }
            tone={forecast.yearEndValue >= view.latestValue ? 'success' : 'danger'}
          />
        ) : null}
      </StatRow>
      <SegmentedControl
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        testID="stocks-period"
      />
      <SegmentedControl options={CHARTS} value={chart} onChange={setChart} testID="stocks-chart" />
      <Charts view={view} period={period} chart={chart} now={ctx.now} />
      {chart === 'bars' ? (
        <>
          <Rows>
            {shown.map((p) => (
              <ItemRow
                key={p.relativeLabel}
                title={p.relativeLabel}
                subtitle={`Invested ${num(p.invest)}, profit ${signed(p.profit)}`}
                trailing={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="subheadline" mono style={{ fontVariant: ['tabular-nums'] }}>
                      {num(p.value)}
                    </Text>
                    {p.profitPct !== null ? (
                      <Text
                        variant="caption2"
                        mono
                        tone={p.profitPct >= 0 ? 'success' : 'danger'}
                      >{`${signed(p.profitPct, 1)}%`}</Text>
                    ) : null}
                  </View>
                }
              />
            ))}
          </Rows>
          {newest.length > 6 ? (
            <Button
              variant="plain"
              label={all ? 'Show less' : `Show all ${newest.length}`}
              onPress={() => setAll(!all)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
