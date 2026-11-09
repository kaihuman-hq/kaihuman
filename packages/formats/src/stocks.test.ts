import { describe, expect, it } from 'vitest';
import { aggregateByPeriod, buildPeriodForecast, parseStocks } from './stocks.js';

const FILE = [
  'timestamp,current value,invest',
  '2026-01-10,1000,1000',
  '2026-02-10,1100,',
  '2026-03-10,1300,200',
].join('\n');

describe('buildPeriodForecast', () => {
  const monthly = aggregateByPeriod(parseStocks(FILE), 'monthly');

  it('projects the months left in the injected current year', () => {
    const f = buildPeriodForecast(monthly, 'monthly', new Date(2026, 3, 1));
    expect(f?.forecastPoints.map((p) => p.relativeLabel)).toEqual([
      'M5/2026',
      'M6/2026',
      'M7/2026',
      'M8/2026',
      'M9/2026',
      'M10/2026',
      'M11/2026',
      'M12/2026',
    ]);
    expect(f?.periodsRemaining).toBe(8);
  });

  it('projects the next two years for yearly data', () => {
    const yearly = aggregateByPeriod(
      parseStocks('timestamp,current value,invest\n2024-06-01,100,100\n2025-06-01,150,'),
      'yearly',
    );
    const f = buildPeriodForecast(yearly, 'yearly', new Date(2026, 0, 1));
    expect(f?.forecastPoints.map((p) => p.label)).toEqual(['2027', '2028']);
  });

  it('returns null below two periods', () => {
    expect(buildPeriodForecast(monthly.slice(0, 1), 'monthly', new Date(2026, 3, 1))).toBeNull();
  });
});
