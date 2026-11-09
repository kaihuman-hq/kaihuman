import { describe, expect, it } from 'vitest';
import {
  compareYearData,
  getMonthlyStats,
  monthPctChange,
  parseConsumption,
  sameDayLastYear,
  toggleCompareYear,
} from './consumption.js';

describe('sameDayLastYear', () => {
  it('returns the same calendar day one year earlier', () => {
    expect(sameDayLastYear('2026-10-08')).toBe('2025-10-08');
    expect(sameDayLastYear('2026-01-01')).toBe('2025-01-01');
  });

  it('maps Feb 29 to a non-existent date so no entry matches', () => {
    expect(sameDayLastYear('2024-02-29')).toBe('2023-02-29');
  });
});

const csv = [
  'created,Gas[title:Gas;unit:m3]',
  '2025-01-01,0',
  '2025-01-31,30',
  '2025-02-01,31',
  '2025-02-28,59',
  '2026-01-01,100',
  '2026-01-31,160',
].join('\n');

describe('monthly comparison helpers', () => {
  const { data } = parseConsumption(csv);
  const stats = getMonthlyStats(data);

  it('compares a month with the same month a year earlier', () => {
    const jan26 = monthPctChange(stats, 2026, 1, 'Gas');
    const jan25 = stats.find((s) => s.year === 2025 && s.month === 1)?.avgPerDayByKey.Gas ?? 0;
    const jan26avg = stats.find((s) => s.year === 2026 && s.month === 1)?.avgPerDayByKey.Gas ?? 0;
    expect(jan26).toBeCloseTo(((jan26avg - jan25) / jan25) * 100);
    expect(monthPctChange(stats, 2025, 1, 'Gas')).toBeNull();
  });

  it('builds twelve values per year, cumulative or average', () => {
    const [y25, y26] = compareYearData(stats, [2025, 2026], 'Gas', 'cumulative');
    expect(y25).toHaveLength(12);
    expect(y26?.[11]).toBeNull();
    const jan = y25?.[0] ?? 0;
    expect(y25?.[1]).toBeGreaterThan(jan);
    expect(y26?.[0]).toBeGreaterThan(0);
    const [avg25] = compareYearData(stats, [2025], 'Gas', 'avg');
    expect(avg25?.[0]).toBeGreaterThan(0);
  });

  it('toggles years like the web legend', () => {
    const years = [2024, 2025, 2026];
    const all = new Set(years);
    expect([...toggleCompareYear(all, years, 2025)]).toEqual([2025]);
    expect([...toggleCompareYear(new Set([2025]), years, 2025)]).toEqual(years);
    expect([...toggleCompareYear(new Set([2025]), years, 2026)].sort()).toEqual([2025, 2026]);
    expect(toggleCompareYear(new Set([2025, 2026]), years, 2025).has(2025)).toBe(false);
  });
});
