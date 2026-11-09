import { describe, expect, it } from 'vitest';
import {
  axisLabels,
  BAR_LIMIT,
  barGroups,
  changeValues,
  forecastChart,
  forecastRows,
  stocksView,
} from './stocks-tile.js';

const NOW = new Date(2026, 5, 15, 12, 0, 0);
const FILE = [
  'timestamp,current value,invest',
  '2026-01-10,1000,1000',
  '2026-02-10,1100,',
  '2026-03-10,1300,200',
  '2026-04-10,1400,',
  '2026-05-10,1600,100',
].join('\n');

describe('stocks forecast', () => {
  const view = stocksView(FILE, NOW);

  it('projects the rest of the year per period from a linear trend', () => {
    const f = view?.forecasts.monthly;
    expect(f?.forecastPoints.map((p) => p.relativeLabel)).toEqual([
      'M7/2026',
      'M8/2026',
      'M9/2026',
      'M10/2026',
      'M11/2026',
      'M12/2026',
    ]);
    expect(f?.yearEndValue).toBeGreaterThan(view?.latestValue ?? 0);
    expect(f?.periodsRemaining).toBe(6);
    expect(f?.r2).toBeGreaterThan(0.9);
    // Only one year of data: the yearly view has no trend to fit.
    expect(view?.forecasts.yearly).toBeNull();
  });

  it('needs two periods before forecasting', () => {
    expect(
      stocksView('timestamp,current value,invest\n2026-01-10,1000,1000', NOW)?.forecasts,
    ).toEqual({
      weekly: null,
      monthly: null,
      yearly: null,
    });
  });
});

describe('chart series', () => {
  const view = stocksView(FILE, NOW);
  const points = view?.periods.monthly ?? [];

  it('groups invested, value and non-negative profit for the bar chart', () => {
    const groups = barGroups(points);
    expect(groups).toHaveLength(5);
    expect(groups[0]).toEqual({ label: '01', values: [1000, 1000, 0] });
    expect(groups[4]?.values).toEqual([1300, 1600, 300]);
  });

  it('shows only the latest periods in the bar chart', () => {
    const many = Array.from({ length: BAR_LIMIT + 6 }, (_, i) => ({
      label: String(i),
      relativeLabel: String(i),
      value: 1,
      invest: 1,
      profit: 0,
      profitPct: null,
    }));
    const groups = barGroups(many);
    expect(groups).toHaveLength(BAR_LIMIT);
    expect(groups[0]?.label).toBe('6');
  });

  it('plots the change versus the previous period, zero for the first', () => {
    const change = changeValues(points);
    expect(change[0]).toBe(0);
    expect(change[1]).toBeCloseTo(10);
  });

  it('joins history and projection at the last observed value', () => {
    const forecast = view?.forecasts.monthly ?? null;
    const data = forecastChart(points, forecast);
    expect(data.history).toHaveLength(11);
    expect(data.history[4]).toBe(1600);
    expect(data.history[5]).toBeNull();
    expect(data.projected.slice(0, 4)).toEqual([null, null, null, null]);
    expect(data.projected[4]).toBe(1600);
    expect(data.projected[5]).toBe(forecast?.forecastPoints[0]?.value);
    expect(data.labels.slice(-1)).toEqual(['12']);
    expect(forecastChart(points, null).projected).toEqual([]);
  });

  it('tabulates projections against the current value and the invested total', () => {
    const rows = forecastRows(view?.forecasts.monthly ?? null, 1600, 1300);
    expect(rows).toHaveLength(6);
    expect(rows[0]?.vsCurrent).toBeCloseTo((rows[0]?.value ?? 0) - 1600);
    expect(rows[0]?.profit).toBeCloseTo((rows[0]?.value ?? 0) - 1300);
    expect(forecastRows(null, 1, 1)).toEqual([]);
  });

  it('thins axis labels but keeps the last', () => {
    const labels = axisLabels(Array.from({ length: 30 }, (_, i) => String(i)));
    expect(labels.filter(Boolean).length).toBeLessThanOrEqual(11);
    expect(labels[29]).toBe('29');
    expect(labels[1]).toBe('');
  });
});
