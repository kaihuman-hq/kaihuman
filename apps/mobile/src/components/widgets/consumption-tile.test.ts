import { describe, expect, it } from 'vitest';
import {
  compareSeries,
  consumptionModel,
  consumptionView,
  formatReading,
  monthRows,
  removeConsumptionMeter,
} from './consumption-tile.js';

const CSV = [
  'created,Gas[title:Gas;unit:m³;yearlyTarget:1200],Power[unit:kWh;higherIsBetter:true]',
  '2025-01-01,0,0',
  '2025-01-31,60,30',
  '2025-02-28,100,50',
  '2026-01-01,200,"100,5"',
  '2026-01-31,230,140',
].join('\n');

describe('monthly rows', () => {
  const model = consumptionModel(CSV);

  it('lists twelve months with totals, averages and the change against last year', () => {
    const rows = monthRows(model, 2026, 'Gas');
    expect(rows).toHaveLength(12);
    const jan = rows[0];
    expect(jan?.total).toBeGreaterThan(0);
    expect(jan?.days).toBeGreaterThan(0);
    expect(jan?.change).not.toBeNull();
    expect(rows[11]?.total).toBeNull();
    expect(rows[11]?.change).toBeNull();
  });

  it('judges a change by higherIsBetter', () => {
    const gas = monthRows(model, 2026, 'Gas')[0];
    const power = monthRows(model, 2026, 'Power')[0];
    if (gas?.change == null || power?.change == null) throw new Error('expected changes');
    expect(gas.good).toBe(gas.change < 0);
    expect(power.good).toBe(power.change > 0);
  });
});

describe('compare series', () => {
  it('returns one 12-slot series per year, cumulative or average', () => {
    const model = consumptionModel(CSV);
    expect(model.years).toEqual([2025, 2026]);
    const cum = compareSeries(model, 'Gas', 'cumulative');
    expect(cum.map((s) => s.year)).toEqual([2025, 2026]);
    expect(cum[0]?.values).toHaveLength(12);
    const jan = cum[0]?.values[0] ?? 0;
    expect(cum[0]?.values[1] ?? 0).toBeGreaterThan(jan);
    expect(compareSeries(model, 'Gas', 'avg')[0]?.values[0]).toBeGreaterThan(0);
  });
});

describe('formatReading', () => {
  it('prints whole numbers plain and others with two decimals', () => {
    expect(formatReading(12)).toBe('12');
    expect(formatReading(12.345)).toBe('12.35');
    expect(formatReading(Number.NaN)).toBe('–');
  });
});

describe('removeConsumptionMeter', () => {
  it('drops the column from the header and every row, keeping quoted cells intact', () => {
    const r = removeConsumptionMeter(CSV, 'Gas');
    expect(r).toEqual({
      ok: true,
      content: [
        'created,Power[unit:kWh;higherIsBetter:true]',
        '2025-01-01,0',
        '2025-01-31,30',
        '2025-02-28,50',
        '2026-01-01,"100,5"',
        '2026-01-31,140',
      ].join('\n'),
    });
    if (r.ok) {
      expect(consumptionView(r.content, new Date(2026, 1, 1)).meters.map((m) => m.key)).toEqual([
        'Power',
      ]);
    }
  });

  it('removes the last column, keeps CRLF and a trailing newline', () => {
    const r = removeConsumptionMeter('created,A,B\r\n2025-01-01,1,2\r\n', 'B');
    expect(r).toEqual({ ok: true, content: 'created,A\r\n2025-01-01,1\r\n' });
  });

  it('rejects unknown meters and never touches the date column', () => {
    expect(removeConsumptionMeter(CSV, 'Water')).toEqual({ ok: false, error: 'Meter not found.' });
    expect(removeConsumptionMeter(CSV, 'created').ok).toBe(false);
    expect(removeConsumptionMeter('', 'Gas').ok).toBe(false);
  });
});
