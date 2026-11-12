import { localDate, parseHabitData } from '@kaihuman/formats';
import {
  addBudgetTransaction,
  addCollectionEntry,
  BUDGET_CATEGORIES,
  type BudgetView,
  type ConsumptionView,
  clockIn,
  clockOut,
  type DataCollectionView,
  formatElapsed,
  formatReading,
  type HabitView,
  parseBudgetCsv,
  type StocksView,
  type TimerView,
  timeHistoryView,
  toggleHabitToday,
} from '../../../components/widgets/tile-controllers.js';
import { addHref } from './lists.js';
import { tileTitle } from './name.js';
import type { Glance, GlanceInput, GlanceTone } from './types.js';

const num = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (n: number): string =>
  `${(Math.round(Math.abs(n) * 10) / 10).toLocaleString('en-US')}%`;
const arrow = (n: number): string => (n >= 0 ? '▲' : '▼');
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** Compact money/number: 48,200 -> 48.2k, 1,250,000 -> 1.25M. */
export const compact = (n: number): string => {
  const abs = Math.abs(n);
  const trim = (v: number) => String(Math.round(v * 100) / 100);
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e4) return `${trim(n / 1e3)}k`;
  return num(Math.round(n));
};

const minutesLabel = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ─── habit ───────────────────────────────────────────────────────────────────

/** Longest run of consecutive reached days in the whole file, at least the live streak. */
const bestStreak = (content: string, current: number): number => {
  const days = [
    ...new Set(
      parseHabitData(content)
        .entries.filter((e) => e.reached)
        .map((e) => e.date),
    ),
  ].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const t = parseIso(d);
    const at = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    run = prev !== null && at - prev === 86_400_000 ? run + 1 : 1;
    prev = at;
    best = Math.max(best, run);
  }
  return Math.max(best, current);
};

export function habitGlance(input: GlanceInput, view: HabitView): Glance {
  const title = tileTitle(input.path, 'Habit');
  return {
    title,
    icon: 'flag',
    tint: 'orange',
    hero: String(view.currentStreak),
    unit: 'days',
    label: `streak · best ${bestStreak(input.content, view.currentStreak)}`,
    viz: {
      kind: 'days',
      days: view.strip.map((d) => ({
        label: DAY_INITIALS[parseIso(d.date).getDay()] ?? '',
        on: d.reached,
        today: d.isToday,
      })),
    },
    action: {
      kind: 'tap',
      icon: 'check',
      label: `${title} ✓`,
      done: view.checkedInToday,
      run: (content, now) => toggleHabitToday(content, now),
    },
  };
}

// ─── time tracking ───────────────────────────────────────────────────────────

export function timerGlance(input: GlanceInput, view: TimerView): Glance {
  const days = new Map(
    timeHistoryView(input.content, input.now).days.map((d) => [d.date, d.minutes]),
  );
  const values: number[] = [];
  for (let back = 6; back >= 0; back--) {
    const at = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate() - back);
    values.push(days.get(localDate(at)) ?? 0);
  }
  const base = {
    title: tileTitle(input.path, 'Time'),
    icon: 'timer' as const,
    tint: 'blue' as const,
    viz: { kind: 'bars' as const, values, accent: 6 },
  };
  if (view.state === 'running') {
    return {
      ...base,
      eyebrow: 'Running',
      live: true,
      hero: formatElapsed(view.elapsedSeconds),
      label: `today ${minutesLabel(view.todayMinutes)}`,
      action: {
        kind: 'tap',
        icon: 'stop',
        label: 'Stop timer',
        run: (content, now) => clockOut(content, now),
      },
    };
  }
  return {
    ...base,
    hero: minutesLabel(view.todayMinutes),
    label: 'today',
    action: {
      kind: 'tap',
      icon: 'play',
      label: 'Start timer',
      run: (content, now) => clockIn(content, now),
    },
  };
}

// ─── consumption ─────────────────────────────────────────────────────────────

const COUNT_UNITS = new Set(['', 'cup', 'cups', 'x', '×', 'count', 'pcs', 'times']);

export function consumptionGlance(input: GlanceInput, view: ConsumptionView): Glance {
  const title = tileTitle(input.path, 'Consumption');
  const meter = view.meters[0];
  // The full reading form (date and every meter) is the one way in, so a +1 or a one-meter
  // field never writes a reading the user did not see.
  const action = {
    kind: 'open',
    icon: 'add',
    label: meter ? `Add ${title} reading` : 'Add meter',
    href: addHref(input.path),
    track: true,
  } as const;
  if (!meter) {
    return { title, icon: 'gauge', tint: 'blue', hero: '--', label: 'no readings', action };
  }
  const today = localDate(input.now);
  const latest = view.recent[0];
  if (COUNT_UNITS.has(meter.unit.trim().toLowerCase())) {
    const count = latest?.date === today ? (latest.use[meter.key] ?? 0) : 0;
    const target = meter.yearlyTarget ? Math.max(1, Math.round(meter.yearlyTarget / 365)) : null;
    const avg = view.years[0]?.perDay[meter.key];
    const total = target ?? Math.max(4, count);
    return {
      title,
      icon: 'gauge',
      tint: 'yellow',
      hero: formatReading(count),
      unit: target ? `/ ${target}` : undefined,
      label: `${meter.unit.trim() || 'today'}${meter.unit.trim() ? ' today' : ''}${
        avg !== undefined && Number.isFinite(avg)
          ? ` · avg ${(Math.round(avg * 10) / 10).toFixed(1)}`
          : ''
      }`,
      viz: { kind: 'pills', total, filled: Math.min(Math.round(count), total) },
      action,
    };
  }
  const use = latest?.use[meter.key] ?? null;
  const lastYear = latest?.lastYear[meter.key] ?? null;
  const hero = use ?? meter.lastPeriodUse ?? meter.yearUse;
  let delta: Glance['delta'];
  if (use !== null && lastYear !== null && lastYear > 0) {
    const change = ((use - lastYear) / lastYear) * 100;
    const tone: GlanceTone = change > 0 ? 'danger' : 'success';
    delta = { text: `${arrow(change)} ${pct(change)}`, tone };
  }
  const spark = view.recent
    .slice(0, 14)
    .map((r) => r.use[meter.key])
    .filter((v): v is number => v !== null && v !== undefined)
    .reverse();
  return {
    title,
    icon: 'gauge',
    tint: 'blue',
    hero: formatReading(hero),
    unit: meter.unit || undefined,
    label: use !== null || meter.lastPeriodUse !== null ? 'last reading' : 'this year',
    delta,
    viz: spark.length > 1 ? { kind: 'spark', values: spark, tone: 'info', fill: true } : undefined,
    action,
  };
}

// ─── data collection ─────────────────────────────────────────────────────────

export function collectionGlance(input: GlanceInput, view: DataCollectionView): Glance {
  const title = tileTitle(input.path, 'Data');
  // A sum/avg column is the figure the file exists for, so it beats the first typed column.
  const series = view.series.find((s) => s.aggregate) ?? view.series[0];
  const base = { title, icon: 'table' as const, tint: 'olive' as const };
  if (!series) return { ...base, hero: '--', label: `${view.rowCount} rows` };
  const typed =
    view.series.find((s) => !s.aggregate)?.column ??
    view.columns.find((c) => c.type === 'number')?.name;
  const window = series.points.slice(-30).map((p) => p.y);
  const change = (window.at(-1) ?? 0) - (window[0] ?? 0);
  const dateCol = view.columns.find((c) => c.type === 'date');
  return {
    ...base,
    hero: num(series.latest),
    unit: series.unit || undefined,
    label: series.aggregate
      ? `${series.aggregate} · ${view.rowCount} rows`
      : `${view.rowCount} rows`,
    delta:
      window.length > 1
        ? {
            text: change === 0 ? '▬ 0' : `${arrow(change)} ${num(Math.abs(change))}`,
            tone: change === 0 ? 'muted' : 'success',
          }
        : undefined,
    viz:
      window.length > 1 ? { kind: 'spark', values: window, tone: 'accent', fill: true } : undefined,
    ...(typed && {
      action: {
        kind: 'field',
        icon: 'add',
        label: `Add ${title}`,
        placeholder: typed,
        keyboard: 'decimal-pad',
        submit: (content, value, now) =>
          addCollectionEntry(
            content,
            {
              ...(dateCol ? { [dateCol.name]: localDate(now) } : {}),
              [typed]: value,
            },
            now,
          ),
      },
    }),
  };
}

// ─── stocks ──────────────────────────────────────────────────────────────────

export function stocksGlance(input: GlanceInput, view: StocksView | null): Glance {
  const base = {
    title: tileTitle(input.path, 'Portfolio'),
    icon: 'chartLine' as const,
    tint: 'green' as const,
  };
  if (!view) return { ...base, hero: '--', label: 'no data' };
  const up = (view.changeVsPrev ?? view.profit) >= 0;
  const tone: GlanceTone = up ? 'success' : 'danger';
  const profit = `${view.profit >= 0 ? '+' : '-'}${num(Math.round(Math.abs(view.profit)))}`;
  const values = view.series.slice(-30).map((p) => p.value);
  return {
    ...base,
    hero: compact(view.latestValue),
    label: `${profit} profit`,
    delta:
      view.changeVsPrevPct === null
        ? undefined
        : { text: `${arrow(view.changeVsPrevPct)} ${pct(view.changeVsPrevPct)}`, tone },
    viz: values.length > 1 ? { kind: 'spark', values, tone, fill: true } : undefined,
  };
}

// ─── budget ──────────────────────────────────────────────────────────────────

const INCOME = new Set(BUDGET_CATEGORIES.filter((c) => c.type === 'in').map((c) => c.id));
const CAT_TONES = ['cat1', 'cat2', 'cat3'] as const;

export function budgetGlance(input: GlanceInput, view: BudgetView): Glance {
  const { now, content } = input;
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rows = parseBudgetCsv(content).filter(
    (t) => t.date.startsWith(month) && !INCOME.has(t.category),
  );
  const byCat = new Map<string, number>();
  for (const t of rows) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.value);
  const ranked = [...byCat].sort((a, b) => b[1] - a[1]);
  const spent = ranked.reduce((s, [, v]) => s + v, 0);
  const top = ranked.slice(0, 3);
  const rest = spent - top.reduce((s, [, v]) => s + v, 0);
  const label = (id: string) => BUDGET_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  const parts: { value: number; tone: GlanceTone }[] = top.map(([, value], i) => ({
    value,
    tone: CAT_TONES[i] ?? 'cat3',
  }));
  if (rest > 0) parts.push({ value: rest, tone: 'muted' });
  // Most used expense category fits a quick add best; the first account is the default wallet.
  const used = new Map<string, number>();
  for (const t of parseBudgetCsv(content)) {
    if (!INCOME.has(t.category)) used.set(t.category, (used.get(t.category) ?? 0) + 1);
  }
  const category = [...used].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other-outcome';
  const account = view.accounts[0]?.id ?? 'Cash';
  return {
    title: tileTitle(input.path, 'Budget'),
    icon: 'wallet',
    tint: 'green',
    hero: compact(spent),
    label: `spent · ${MONTH_SHORT[now.getMonth()]}`,
    viz:
      spent > 0
        ? {
            kind: 'segments',
            parts,
            legend: top
              .slice(0, 2)
              .map(([id], i) => ({ label: label(id), tone: CAT_TONES[i] ?? 'cat3' })),
          }
        : undefined,
    action: {
      kind: 'field',
      icon: 'add',
      label: 'Add expense',
      placeholder: 'Amount',
      keyboard: 'decimal-pad',
      submit: (c, value, at) =>
        addBudgetTransaction(c, {
          name: 'Expense',
          account,
          category,
          value,
          date: localDate(at),
        }),
    },
  };
}
