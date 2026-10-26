import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NUMBERING,
  findGaps,
  formatNumber,
  nextNumber,
  parseNumber,
  seriesOf,
} from './numbering.js';

const RE = DEFAULT_NUMBERING.invoice;

describe('numbering', () => {
  it('formats with a minimum width and grows past it', () => {
    expect(formatNumber(RE, 2026, 42)).toBe('RE-2026-0042');
    expect(formatNumber(DEFAULT_NUMBERING.offer, 2026, 1234)).toBe('AN-2026-1234');
  });

  it('parses its own output and rejects other formats', () => {
    expect(parseNumber(RE, 'RE-2026-0042')).toEqual({ year: 2026, seq: 42 });
    expect(parseNumber(RE, 'AN-2026-001')).toBeNull();
    expect(parseNumber(RE, 'RE-2026-42')).toBeNull();
    expect(parseNumber('{nnn}/{yyyy}', '007/2026')).toEqual({ year: 2026, seq: 7 });
  });

  it('takes highest plus one, per year', () => {
    expect(nextNumber(RE, 2026, ['RE-2026-0001', 'RE-2026-0002'])).toBe('RE-2026-0003');
    expect(nextNumber(RE, 2027, ['RE-2026-0042'])).toBe('RE-2027-0001');
    expect(nextNumber(RE, 2026, [])).toBe('RE-2026-0001');
    expect(nextNumber(RE, 2026, ['RE-2026-0001', 'RE-2026-0005'])).toBe('RE-2026-0006');
  });

  it('finds gaps between 1 and the maximum', () => {
    expect(findGaps(RE, 2026, ['RE-2026-0001', 'RE-2026-0003'])).toEqual([2]);
    expect(findGaps(RE, 2026, ['RE-2026-0003', 'RE-2025-0009'])).toEqual([1, 2]);
    expect(findGaps(RE, 2026, [])).toEqual([]);
  });

  it('puts credit notes in the invoice series', () => {
    expect(seriesOf('credit-note')).toBe('invoice');
    expect(seriesOf('invoice')).toBe('invoice');
    expect(seriesOf('offer')).toBe('offer');
  });
});
