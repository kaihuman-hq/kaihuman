import { parseTimeTracking } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  budgetView,
  consumptionView,
  dataCollectionView,
  habitView,
  stocksView,
  timerView,
} from '../../../components/widgets/tile-controllers.js';
import {
  budgetGlance,
  collectionGlance,
  compact,
  consumptionGlance,
  habitGlance,
  stocksGlance,
  timerGlance,
} from './trackers.js';
import type { Glance, QuickAction } from './types.js';

// Thursday 2026-11-05, 10:00 local.
const now = new Date(2026, 10, 5, 10, 0, 0);
const input = (path: string, content: string) => ({ path, content, now });
const tap = (g: Glance): Extract<QuickAction, { kind: 'tap' }> => {
  if (g.action?.kind !== 'tap') throw new Error('expected tap');
  return g.action;
};
const field = (g: Glance): Extract<QuickAction, { kind: 'field' }> => {
  if (g.action?.kind !== 'field') throw new Error('expected field');
  return g.action;
};
const text = (r: string | { ok: boolean; content?: string }): string =>
  typeof r === 'string' ? r : (r as { content: string }).content;

describe('habitGlance', () => {
  const csv = [
    'iso date;goal reached',
    '2026-10-01;x',
    '2026-10-02;x',
    '2026-10-03;x',
    '2026-10-04;x',
    '2026-11-03;x',
    '2026-11-04;x',
  ].join('\n');
  const g = habitGlance(input('.kh/meditate.habit.csv', csv), habitView(csv, now));

  it('shows the streak with the best run and a weekday strip', () => {
    expect(g).toMatchObject({
      title: 'Meditate',
      icon: 'flag',
      tint: 'orange',
      hero: '2',
      unit: 'days',
    });
    expect(g.label).toBe('streak · best 4');
    if (g.viz?.kind !== 'days') throw new Error('days');
    expect(g.viz.days.map((d) => d.label).join('')).toBe('FSSMTWT');
    expect(g.viz.days[6]).toEqual({ label: 'T', on: false, today: true });
    expect(g.viz.days[4]?.on).toBe(true);
  });

  it('toggles today through the action', () => {
    const a = tap(g);
    expect(a).toMatchObject({ icon: 'check', label: 'Meditate ✓', done: false });
    const on = text(a.run(csv, now));
    const g2 = habitGlance(input('.kh/meditate.habit.csv', on), habitView(on, now));
    expect(g2.hero).toBe('3');
    expect(tap(g2).done).toBe(true);
  });
});

describe('timerGlance', () => {
  const idle = 'iso date;time\n2026-11-05;08:00,09:30\n2026-11-04;08:00,10:00\n';
  it('idle: today total, start action, 7 bars with today accented', () => {
    const g = timerGlance(input('deep-work.timetracking.csv', idle), timerView(idle, now));
    expect(g).toMatchObject({ title: 'Deep work', icon: 'timer', hero: '1h 30m', label: 'today' });
    expect(g.live).toBeUndefined();
    expect(g.viz).toEqual({ kind: 'bars', values: [0, 0, 0, 0, 0, 120, 90], accent: 6 });
    const a = tap(g);
    expect(a).toMatchObject({ icon: 'play', label: 'Start timer' });
    const running = text(a.run(idle, now));
    expect(timerView(running, now).state).toBe('running');
  });

  it('running: live elapsed hero, stop action', () => {
    const running = 'iso date;time\n2026-11-05;08:00,09:00,09:30\n';
    const g = timerGlance(input('t.timetracking.csv', running), timerView(running, now));
    expect(g).toMatchObject({
      eyebrow: 'Running',
      live: true,
      hero: '0:30:00',
      label: 'today 1h 30m',
    });
    const a = tap(g);
    expect(a).toMatchObject({ icon: 'stop', label: 'Stop timer' });
    const stopped = text(a.run(running, now));
    expect(parseTimeTracking(stopped).entries[0]?.intervals.at(-1)?.end).toBe('10:00');
  });
});

describe('consumptionGlance', () => {
  const COUNT = [
    'created,Coffee[unit:cups;yearlyTarget:1460]',
    '2026-11-01,10',
    '2026-11-02,13',
    '2026-11-03,15',
    '2026-11-04,19',
    '2026-11-05,22',
  ].join('\n');

  it('count variant: today count against the daily target with pills', () => {
    const g = consumptionGlance(
      input('coffee.consumption.csv', COUNT),
      consumptionView(COUNT, now),
    );
    expect(g).toMatchObject({
      title: 'Coffee',
      icon: 'gauge',
      tint: 'yellow',
      hero: '3',
      unit: '/ 4',
    });
    expect(g.label).toMatch(/^cups today · avg \d\.\d$/);
    expect(g.viz).toEqual({ kind: 'pills', total: 4, filled: 3 });
    const a = tap(g);
    expect(a).toMatchObject({ icon: 'add', label: 'Coffee +1' });
    const next = text(a.run(COUNT, now));
    const v = consumptionView(next, now);
    expect(v.meters[0]?.latestReading).toBe(23);
    expect(v.recent[0]?.use.Coffee).toBe(4);
  });

  it('count variant: +1 on a day without a reading appends one', () => {
    const later = new Date(2026, 10, 6, 9, 0);
    const a = tap(
      consumptionGlance(
        { path: 'coffee.consumption.csv', content: COUNT, now: later },
        consumptionView(COUNT, later),
      ),
    );
    const next = text(a.run(COUNT, later));
    expect(consumptionView(next, later).meters[0]?.latestReading).toBe(23);
    expect(consumptionView(next, later).meters[0]?.latestDate).toBe('2026-11-06');
  });

  const POWER = [
    'created,Power[unit:kWh]',
    '2025-11-03,1000',
    '2025-11-04,1010',
    '2025-11-05,1022',
    '2026-11-03,2000',
    '2026-11-04,2010',
    '2026-11-05,2018',
  ].join('\n');

  it('meter variant: use hero, delta vs last year, spark and reading field', () => {
    const g = consumptionGlance(input('power.consumption.csv', POWER), consumptionView(POWER, now));
    expect(g).toMatchObject({ tint: 'blue', hero: '8', unit: 'kWh', label: 'last reading' });
    expect(g.delta).toEqual({ text: '▼ 33.3%', tone: 'success' });
    expect(g.viz?.kind).toBe('spark');
    const f = field(g);
    expect(f).toMatchObject({
      label: 'Power reading',
      placeholder: 'Meter reading',
      keyboard: 'decimal-pad',
    });
    const r = f.submit(POWER, '2025', new Date(2026, 10, 6));
    expect(r.ok).toBe(true);
    if (r.ok) expect(consumptionView(r.content, now).meters[0]?.latestReading).toBe(2025);
  });

  it('marks a rise as danger', () => {
    const csv =
      'created,Power[unit:kWh]\n2025-11-04,10\n2025-11-05,15\n2026-11-04,100\n2026-11-05,120';
    expect(
      consumptionGlance(input('p.consumption.csv', csv), consumptionView(csv, now)).delta,
    ).toEqual({
      text: '▲ 300%',
      tone: 'danger',
    });
  });
});

describe('collectionGlance', () => {
  const csv = [
    'name::When,type::date;name::Weight,type::number,unit::kg',
    '2026-11-01;80',
    '2026-11-03;79.5',
    '2026-11-04;79.2',
  ].join('\n');
  const g = collectionGlance(input('weight.data-collection.csv', csv), dataCollectionView(csv));

  it('latest value, change and spark', () => {
    expect(g).toMatchObject({
      icon: 'table',
      tint: 'olive',
      hero: '79.2',
      unit: 'kg',
      label: '3 rows',
    });
    expect(g.delta).toEqual({ text: '▼ 0.8', tone: 'success' });
    expect(g.viz).toEqual({ kind: 'spark', values: [80, 79.5, 79.2], tone: 'accent', fill: true });
  });

  it('adds an entry dated today', () => {
    const f = field(g);
    expect(f.placeholder).toBe('Weight');
    const r = f.submit(csv, '78.9', now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.endsWith('\n2026-11-05;78.9')).toBe(true);
  });

  it('empty collection', () => {
    const e = 'name::When,type::date;name::Weight,type::number';
    expect(
      collectionGlance(input('w.data-collection.csv', e), dataCollectionView(e)),
    ).toMatchObject({
      hero: '--',
      label: '0 rows',
    });
  });
});

describe('stocksGlance', () => {
  const csv = [
    'timestamp,current value,invest',
    '2026-10-10,46000,40000',
    '2026-11-04,48200,',
  ].join('\n');
  it('compact value, change and profit', () => {
    const g = stocksGlance(input('p.stocks.csv', csv), stocksView(csv, now));
    expect(g).toMatchObject({
      icon: 'chartLine',
      tint: 'green',
      hero: '48.2k',
      label: '+8,200 profit',
    });
    expect(g.delta).toEqual({ text: '▲ 4.8%', tone: 'success' });
    expect(g.viz).toEqual({ kind: 'spark', values: [46000, 48200], tone: 'success', fill: true });
    expect(g.action).toBeUndefined();
  });
  it('null view', () => {
    expect(stocksGlance(input('p.stocks.csv', ''), null)).toMatchObject({
      hero: '--',
      label: 'no data',
    });
  });
  it('compacts', () => {
    expect([compact(950), compact(48200), compact(1250000)]).toEqual(['950', '48.2k', '1.25M']);
  });
});

describe('budgetGlance', () => {
  const csv = [
    'name;account;category;date;value',
    'Salary;Bank;earnings;2026-11-01;2000',
    'Rent;Bank;running-costs;2026-11-02;800',
    'Lunch;Cash;food;2026-11-05;50',
    'Dinner;Cash;food;2026-11-04;40',
    'Bus;Cash;transport;2026-11-03;30',
    'Cinema;Cash;entertainment;2026-11-03;20',
    'Old;Cash;food;2026-10-03;999',
  ].join('\n');
  const g = budgetGlance(input('budget.budget.csv', csv), budgetView(csv));

  it('month spending, category segments and legend', () => {
    expect(g).toMatchObject({ icon: 'wallet', tint: 'green', hero: '940', label: 'spent · Nov' });
    expect(g.viz).toEqual({
      kind: 'segments',
      parts: [
        { value: 800, tone: 'cat1' },
        { value: 90, tone: 'cat2' },
        { value: 30, tone: 'cat3' },
        { value: 20, tone: 'muted' },
      ],
      legend: [
        { label: 'Running Costs', tone: 'cat1' },
        { label: 'Food', tone: 'cat2' },
      ],
    });
  });

  it('adds an expense dated today in the most used category', () => {
    const f = field(g);
    expect(f).toMatchObject({ label: 'Add expense', placeholder: 'Amount' });
    const r = f.submit(csv, '12,5', now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.split('\n').at(-1)).toBe('Expense;Bank;food;2026-11-05;12.5');
  });

  it('empty file shows zero without a chart', () => {
    const e = 'name;account;category;date;value';
    const g2 = budgetGlance(input('b.budget.csv', e), budgetView(e));
    expect(g2).toMatchObject({ hero: '0', viz: undefined });
    expect(field(g2).submit(e, '5', now).ok).toBe(true);
  });
});
