import { describe, expect, it } from 'vitest';
import type { Line } from './records.js';
import { computeTotals, lineNet } from './totals.js';

const s = (quantity: string, unit_price: number, vat_rate = '19'): Line => ({
  description: 'x',
  quantity,
  unit: 'C62',
  unit_price,
  vat_category: 'S',
  vat_rate,
});

describe('computeTotals', () => {
  it('groups rates by value, not text, and writes the rate canonically', () => {
    const t = computeTotals([s('1', 10000, '19'), s('1', 10000, '19.0'), s('1', 1000, '7.50')]);
    expect(t.breakdown).toEqual([
      { category: 'S', rate: '19', taxable: 20000, tax: 3800 },
      { category: 'S', rate: '7.5', taxable: 1000, tax: 75 },
    ]);
  });

  it('sums line nets per category and rate before applying the percentage', () => {
    const t = computeTotals([
      { ...s('7.5', 9500), description: 'Dev', unit: 'HUR' },
      s('1', 12000),
      s('1', 1000, '7'),
    ]);
    expect(t).toEqual({
      net: 84250,
      vat: 15888,
      gross: 100138,
      breakdown: [
        { category: 'S', rate: '19', taxable: 83250, tax: 15818 },
        { category: 'S', rate: '7', taxable: 1000, tax: 70 },
      ],
    });
  });

  it('rounds VAT once per group, not per line', () => {
    const lines = [s('1', 14), s('1', 14), s('1', 14)];
    expect(computeTotals(lines).vat).toBe(8); // 42 * 0.19 = 7.98; per line it would be 3 x 3 = 9
  });

  it('rounds each line net on its own', () => {
    expect(lineNet(s('0.5', 25))).toBe(13);
    expect(computeTotals([s('0.5', 25), s('0.5', 25)]).net).toBe(26);
  });

  it('forces zero VAT on exempt categories and attaches the reason', () => {
    const t = computeTotals([{ ...s('1', 10000, '19'), vat_category: 'AE' }], {
      AE: 'Reverse charge',
    });
    expect(t.breakdown[0]).toMatchObject({
      category: 'AE',
      tax: 0,
      exemption_reason: 'Reverse charge',
    });
    expect(t).toMatchObject({ net: 10000, vat: 0, gross: 10000 });
    for (const category of ['E', 'K', 'O', 'Z'] as const) {
      expect(computeTotals([{ ...s('1', 10000), vat_category: category }]).vat).toBe(0);
    }
  });

  it('sorts the breakdown by category, then rate', () => {
    const t = computeTotals([
      s('1', 100, '7'),
      { ...s('1', 100, '0'), vat_category: 'E' },
      s('1', 100, '19'),
    ]);
    expect(t.breakdown.map((b) => `${b.category}${b.rate}`)).toEqual(['E0', 'S19', 'S7']);
  });

  it('has an empty breakdown for no lines', () => {
    expect(computeTotals([])).toEqual({ net: 0, vat: 0, gross: 0, breakdown: [] });
  });
});
