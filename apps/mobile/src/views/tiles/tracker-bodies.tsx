import { useState } from 'react';
import { View } from 'react-native';
import {
  addConsumptionMeter,
  addConsumptionReading,
  addStockValue,
  type ConsumptionView,
  consumptionColumns,
  type StockPeriod,
  type StocksView,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, haptics, SegmentedControl, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, Meter, Rows, Stat, StatRow, useDisclosure } from './parts.js';

const num = (n: number, digits = 2) => n.toFixed(digits);
const signed = (n: number, digits = 2) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;

/** Bars of the latest values, newest on the right; a glance replaces the web's hover charts. */
export function Bars({ values, label }: { values: number[]; label: string }) {
  const { colors } = useTheme();
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 3 }}
    >
      {values.map((v, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(4, ((v - min) / span) * 100)}%`,
            borderRadius: 2,
            backgroundColor: i === values.length - 1 ? colors.accent : colors.accentSoft,
          }}
        />
      ))}
    </View>
  );
}

const PERIODS: readonly { value: StockPeriod; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
];

function AddStockForm({ ctx }: { ctx: Ctx }) {
  const form = useDisclosure();
  const [value, setValue] = useState('');
  const [invest, setInvest] = useState('');
  const [date, setDate] = useState('');
  const save = () => {
    if (ctx.apply(addStockValue(ctx.content, value, invest, date, ctx.now))) {
      haptics.success();
      setValue('');
      setInvest('');
      setDate('');
      form.hide();
    } else haptics.error();
  };
  if (!form.open) {
    return <Button variant="tinted" icon="add" label="Add value" onPress={form.show} fullWidth />;
  }
  return (
    <View style={{ gap: 8 }}>
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
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="plain" label="Cancel" onPress={form.hide} />
        <View style={{ flex: 1 }}>
          <Button label="Save value" onPress={save} fullWidth />
        </View>
      </View>
    </View>
  );
}

export function Stocks({ view, ctx }: { view: StocksView | null; ctx: Ctx }) {
  const [period, setPeriod] = useState<StockPeriod>('monthly');
  const [all, setAll] = useState(false);
  if (!view) {
    return (
      <>
        <EmptyLine>No stock data.</EmptyLine>
        <AddStockForm ctx={ctx} />
      </>
    );
  }
  const up = view.profit >= 0;
  const points = view.periods[period];
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
        <Stat label="Below peak" value={`${num(Math.abs(view.drawdownPct), 1)}%`} />
        {view.cagr !== null ? <Stat label="CAGR" value={`${signed(view.cagr, 1)}%`} /> : null}
      </StatRow>
      <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
      <Bars
        values={points.slice(-24).map((p) => p.value)}
        label={`Value per ${period.replace('ly', '')}, latest ${num(view.latestValue)}`}
      />
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
      <AddStockForm ctx={ctx} />
    </>
  );
}

const fmt = (n: number) =>
  Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);

function AddReadingForm({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const columns = consumptionColumns(ctx.content);
  const [date, setDate] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const save = () => {
    if (ctx.apply(addConsumptionReading(ctx.content, date, values, ctx.now))) {
      haptics.success();
      onDone();
    } else haptics.error();
  };
  return (
    <View style={{ gap: 8 }}>
      <TextField
        label="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        placeholder="Today"
        autoCapitalize="none"
      />
      {columns.map((c, i) => (
        <TextField
          key={c.key}
          label={`${c.title}${c.unit ? ` (${c.unit})` : ''}`}
          helper={c.last !== null ? `Last reading ${fmt(c.last)}` : undefined}
          value={values[c.key] ?? ''}
          onChangeText={(t) => setValues((v) => ({ ...v, [c.key]: t }))}
          keyboardType="decimal-pad"
          autoFocus={i === 0}
        />
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="plain" label="Cancel" onPress={onDone} />
        <View style={{ flex: 1 }}>
          <Button label="Save reading" onPress={save} fullWidth />
        </View>
      </View>
    </View>
  );
}

function AddMeterForm({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const save = () => {
    if (ctx.apply(addConsumptionMeter(ctx.content, { name, unit, yearlyTarget: target }))) {
      haptics.success();
      onDone();
    } else haptics.error();
  };
  return (
    <View style={{ gap: 8 }}>
      <TextField label="Meter name" value={name} onChangeText={setName} autoFocus />
      <TextField
        label="Unit"
        value={unit}
        onChangeText={setUnit}
        placeholder="kWh"
        autoCapitalize="none"
      />
      <TextField
        label="Yearly target"
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        placeholder="Optional"
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="plain" label="Cancel" onPress={onDone} />
        <View style={{ flex: 1 }}>
          <Button label="Save meter" onPress={save} fullWidth />
        </View>
      </View>
    </View>
  );
}

type ConsumptionTab = 'recent' | 'years';
const CONSUMPTION_TABS: readonly { value: ConsumptionTab; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'years', label: 'Years' },
];

export function Consumption({ view, ctx }: { view: ConsumptionView; ctx: Ctx }) {
  const [form, setForm] = useState<'reading' | 'meter' | null>(null);
  const [tab, setTab] = useState<ConsumptionTab>('recent');
  const [all, setAll] = useState(false);
  const hasMeters = consumptionColumns(ctx.content).length > 0;
  const year = ctx.now.getFullYear();
  const unitOf = new Map(view.meters.map((m) => [m.key, m]));
  const cell = (key: string, use: number | null, lastYear: number | null) => {
    const m = unitOf.get(key);
    const label = m?.title ?? key;
    if (use === null) return `${label} –`;
    return `${label} ${fmt(use)}${m?.unit ? ` ${m.unit}` : ''}${lastYear !== null ? ` (last year ${fmt(lastYear)})` : ''}`;
  };
  const recent = all ? view.recent : view.recent.slice(0, 5);
  return (
    <>
      {view.meters.length === 0 ? (
        <EmptyLine>{hasMeters ? 'No readings yet.' : 'No meters yet.'}</EmptyLine>
      ) : (
        <View style={{ gap: 16 }}>
          {view.meters.map((m) => (
            <View key={m.key} style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="headline">{m.title}</Text>
                  <Text variant="caption2" tone="secondary">
                    {`Reading ${fmt(m.latestReading)} on ${m.latestDate}`}
                  </Text>
                </View>
                <Text variant="title3" mono style={{ fontVariant: ['tabular-nums'] }}>
                  {`${fmt(m.yearUse)} ${m.unit}`.trim()}
                </Text>
              </View>
              {m.targetProgress !== null && m.yearlyTarget !== undefined ? (
                <>
                  <Meter value={m.targetProgress} label={`${m.title} yearly target`} />
                  <Text variant="footnote" tone="secondary">
                    {`${Math.round(m.targetProgress * 100)}% of ${fmt(m.yearlyTarget)} ${m.unit} in ${year}`}
                  </Text>
                </>
              ) : (
                <Text variant="footnote" tone="secondary">
                  {m.lastPeriodUse !== null
                    ? `Used in ${year}; ${fmt(m.lastPeriodUse)} ${m.unit} since the reading before`
                    : `Used in ${year}`}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
      {view.recent.length > 0 ? (
        <>
          <SegmentedControl options={CONSUMPTION_TABS} value={tab} onChange={setTab} />
          {tab === 'recent' ? (
            <Rows>
              {recent.map((r) => (
                <ItemRow
                  key={r.date}
                  title={r.date}
                  subtitle={Object.keys(r.use)
                    .map((k) => cell(k, r.use[k] ?? null, r.lastYear[k] ?? null))
                    .join(' · ')}
                />
              ))}
            </Rows>
          ) : (
            <Rows>
              {view.years.map((y) => (
                <ItemRow
                  key={y.year}
                  title={String(y.year)}
                  subtitle={view.meters
                    .map((m) =>
                      `${m.title} ${fmt(y.total[m.key] ?? 0)} ${m.unit}, ${fmt(y.perDay[m.key] ?? 0)}/day`.replace(
                        / ,/g,
                        ',',
                      ),
                    )
                    .join(' · ')}
                />
              ))}
            </Rows>
          )}
          {tab === 'recent' && view.recent.length > 5 ? (
            <Button
              variant="plain"
              label={all ? 'Show less' : `Show all ${view.recent.length}`}
              onPress={() => setAll(!all)}
            />
          ) : null}
        </>
      ) : null}
      {form === 'reading' ? (
        <AddReadingForm ctx={ctx} onDone={() => setForm(null)} />
      ) : form === 'meter' ? (
        <AddMeterForm ctx={ctx} onDone={() => setForm(null)} />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {hasMeters ? (
            <View style={{ flex: 1 }}>
              <Button
                variant="tinted"
                icon="add"
                label="Add reading"
                onPress={() => setForm('reading')}
                fullWidth
              />
            </View>
          ) : null}
          <Button
            variant={hasMeters ? 'plain' : 'tinted'}
            icon={hasMeters ? undefined : 'add'}
            label="Add meter"
            onPress={() => setForm('meter')}
          />
        </View>
      )}
    </>
  );
}
