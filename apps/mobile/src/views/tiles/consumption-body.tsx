import type { CompareMode } from '@kaihuman/formats/consumption';
import { toggleCompareYear } from '@kaihuman/formats/consumption';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import {
  type ConsumptionModel,
  compareSeries,
  consumptionModel,
  formatReading,
  monthRows,
  removeConsumptionMeter,
} from '../../components/widgets/consumption-tile.js';
import {
  addConsumptionMeter,
  addConsumptionReading,
  type ConsumptionView,
  consumptionColumns,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, Chip, haptics, SegmentedControl, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { LineChart, Swatch } from './chart-parts.js';
import { EmptyLine, ItemRow, Meter, Rows } from './parts.js';

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

type ConsumptionTab = 'recent' | 'years' | 'monthly' | 'compare';
const CONSUMPTION_TABS: readonly { value: ConsumptionTab; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'years', label: 'Years' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'compare', label: 'Compare' },
];

const MODES = [
  { value: 'cumulative', label: 'Cumulative' },
  { value: 'avg', label: 'Avg / day' },
] as const;

// Same palette as the web compare chart so a year keeps its colour across devices.
const YEAR_COLORS = [
  '#60a5fa',
  '#4ade80',
  '#f59e0b',
  '#f87171',
  '#a78bfa',
  '#34d399',
  '#fb923c',
  '#e879f9',
];
const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

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
  const columns = consumptionColumns(ctx.content);
  const empty = columns.filter((c) => !unitOf.has(c.key));
  const [metric, setMetric] = useState<string | null>(null);
  const model = useMemo(() => consumptionModel(ctx.content), [ctx.content]);
  const modelColumns = model.data.columns;
  const metricKey = modelColumns.find((c) => c.key === metric)?.key ?? modelColumns[0]?.key ?? '';
  // Long-press menu entry; deleting a column drops every reading, so it asks first.
  const removeAction = (key: string, title: string) => [
    {
      label: 'Remove meter',
      destructive: true,
      onPress: () =>
        Alert.alert(
          `Remove ${title}?`,
          'Deletes the meter and all its readings from this file. This cannot be undone.',
          [
            {
              text: 'Remove meter',
              style: 'destructive',
              onPress: () => {
                if (ctx.apply(removeConsumptionMeter(ctx.content, key))) haptics.success();
                else haptics.error();
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ],
        ),
    },
  ];
  return (
    <>
      {view.meters.length === 0 ? (
        <>
          <EmptyLine>{hasMeters ? 'No readings yet.' : 'No meters yet.'}</EmptyLine>
          {empty.map((c) => (
            <ItemRow
              key={c.key}
              testID={`meter-${c.key}`}
              title={c.title}
              subtitle="No readings yet"
              actions={removeAction(c.key, c.title)}
            />
          ))}
        </>
      ) : (
        <View style={{ gap: 16 }}>
          {view.meters.map((m) => (
            <View key={m.key} style={{ gap: 6 }}>
              <ItemRow
                testID={`meter-${m.key}`}
                title={m.title}
                subtitle={`Reading ${fmt(m.latestReading)} on ${m.latestDate}`}
                actions={removeAction(m.key, m.title)}
                trailing={
                  <Text variant="title3" mono style={{ fontVariant: ['tabular-nums'] }}>
                    {`${fmt(m.yearUse)} ${m.unit}`.trim()}
                  </Text>
                }
              />
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
      {empty.length > 0 && view.meters.length > 0
        ? empty.map((c) => (
            <ItemRow
              key={c.key}
              testID={`meter-${c.key}`}
              title={c.title}
              subtitle="No readings yet"
              actions={removeAction(c.key, c.title)}
            />
          ))
        : null}
      {view.recent.length > 0 ? (
        <>
          <SegmentedControl options={CONSUMPTION_TABS} value={tab} onChange={setTab} />
          {tab === 'monthly' || tab === 'compare' ? (
            <>
              {modelColumns.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {modelColumns.map((c) => (
                      <Chip
                        key={c.key}
                        label={c.title}
                        selected={c.key === metricKey}
                        onPress={() => setMetric(c.key)}
                      />
                    ))}
                  </View>
                </ScrollView>
              ) : null}
              {tab === 'monthly' ? (
                <Monthly model={model} metricKey={metricKey} now={ctx.now} />
              ) : (
                <Compare model={model} metricKey={metricKey} />
              )}
            </>
          ) : tab === 'recent' ? (
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

function Monthly({
  model,
  metricKey,
  now,
}: {
  model: ConsumptionModel;
  metricKey: string;
  now: Date;
}) {
  const { colors } = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? model.years[model.years.length - 1] ?? now.getFullYear();
  const unit = model.data.columns.find((c) => c.key === metricKey)?.unit ?? '';
  const rows = monthRows(model, year, metricKey);
  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {model.years.map((y) => (
            <Chip key={y} label={String(y)} selected={y === year} onPress={() => setPicked(y)} />
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
        <Text variant="caption2" tone="secondary" weight="600" style={{ flex: 1 }}>
          MONTH
        </Text>
        <Text
          variant="caption2"
          tone="secondary"
          weight="600"
          style={{ width: 84, textAlign: 'right' }}
        >
          {`TOTAL${unit ? ` (${unit})` : ''}`}
        </Text>
        <Text
          variant="caption2"
          tone="secondary"
          weight="600"
          style={{ width: 64, textAlign: 'right' }}
        >
          {`VS ${year - 1}`}
        </Text>
      </View>
      {rows.map((r) => (
        <View
          key={r.month}
          testID={`month-${r.month}`}
          accessible
          accessibilityLabel={
            r.total === null
              ? `${r.name}, no data`
              : `${r.name}, total ${formatReading(r.total)} ${unit}, average ${formatReading(r.avgPerDay ?? 0)} per day over ${r.days} days`
          }
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderTopColor: colors.separator,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="subheadline">{r.name}</Text>
            {r.avgPerDay !== null ? (
              <Text variant="caption2" tone="secondary">
                {`${formatReading(r.avgPerDay)}/day · ${r.days} days`}
              </Text>
            ) : null}
          </View>
          <Text
            variant="subheadline"
            mono
            style={{ width: 84, textAlign: 'right', fontVariant: ['tabular-nums'] }}
          >
            {r.total === null ? '–' : formatReading(r.total)}
          </Text>
          <Text
            variant="subheadline"
            mono
            tone={r.good === null ? 'secondary' : r.good ? 'success' : 'danger'}
            style={{ width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }}
          >
            {r.change === null ? '–' : `${r.change > 0 ? '+' : ''}${r.change.toFixed(1)}%`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Compare({ model, metricKey }: { model: ConsumptionModel; metricKey: string }) {
  const [mode, setMode] = useState<CompareMode>('cumulative');
  const [active, setActive] = useState<ReadonlySet<number>>(() => new Set(model.years));
  const unit = model.data.columns.find((c) => c.key === metricKey)?.unit ?? '';
  const all = compareSeries(model, metricKey, mode);
  // Dropped years (a file edit) must not strand the selection on years that no longer exist.
  const shown = new Set(model.years.filter((y) => active.has(y)));
  const visible = shown.size === 0 ? new Set(model.years) : shown;
  const series = all.flatMap((s, i) =>
    visible.has(s.year)
      ? [
          {
            key: String(s.year),
            color: YEAR_COLORS[i % YEAR_COLORS.length] as string,
            values: s.values,
            dots: true,
          },
        ]
      : [],
  );
  return (
    <View style={{ gap: 10 }}>
      <SegmentedControl options={MODES} value={mode} onChange={setMode} testID="compare-mode" />
      <Text variant="caption2" tone="secondary">
        {mode === 'avg'
          ? `Avg per day${unit ? ` (${unit})` : ''}, per month`
          : `Cumulative total${unit ? ` (${unit})` : ''}, running sum per year`}
      </Text>
      <LineChart
        testID="compare-chart"
        label="Monthly comparison chart"
        series={series}
        xLabels={MONTH_INITIALS}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {model.years.map((y, i) => {
          const on = visible.has(y);
          const color = YEAR_COLORS[i % YEAR_COLORS.length] as string;
          return (
            <Pressable
              key={y}
              accessibilityRole="button"
              accessibilityLabel={`Year ${y}`}
              accessibilityState={{ selected: on }}
              onPress={() => setActive(toggleCompareYear(visible, model.years, y))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 32,
                paddingHorizontal: 6,
                opacity: on ? 1 : 0.35,
              }}
            >
              <Swatch color={color} />
              <Text variant="footnote" mono>
                {String(y)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
