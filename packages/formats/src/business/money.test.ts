import { describe, expect, it } from 'vitest';
import {
  type Decimal,
  formatDecimal,
  formatMinor,
  mulMinor,
  parseDecimal,
  percentOfMinor,
} from './money.js';

const dec = (text: string): Decimal => {
  const d = parseDecimal(text);
  if (!d) throw new Error(`not a decimal: ${text}`);
  return d;
};

describe('parseDecimal', () => {
  it('keeps the digits and the scale', () => {
    expect(parseDecimal('7.5')).toEqual({ units: 75n, scale: 1 });
    expect(parseDecimal('19')).toEqual({ units: 19n, scale: 0 });
    expect(parseDecimal('-0.5')).toEqual({ units: -5n, scale: 1 });
  });

  it('rejects anything but plain decimals', () => {
    expect(parseDecimal('1e3')).toBeNull();
    expect(parseDecimal('1,5')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('.5')).toBeNull();
    expect(parseDecimal('5.')).toBeNull();
    expect(parseDecimal('+5')).toBeNull();
  });
});

describe('formatDecimal', () => {
  it('keeps trailing zeros', () => {
    expect(formatDecimal(dec('7.50'))).toBe('7.50');
    expect(formatDecimal(dec('19'))).toBe('19');
    expect(formatDecimal(dec('0.05'))).toBe('0.05');
    expect(formatDecimal(dec('-0.5'))).toBe('-0.5');
  });
});

describe('mulMinor', () => {
  it('multiplies a quantity by a price in minor units', () => {
    expect(mulMinor(dec('7.5'), 9500)).toBe(71250);
    expect(mulMinor(dec('0.333'), 10000)).toBe(3330);
  });

  it('rounds half up, away from zero', () => {
    expect(mulMinor(dec('0.5'), 1)).toBe(1);
    expect(mulMinor(dec('-0.5'), 1)).toBe(-1);
    expect(mulMinor(dec('0.4'), 1)).toBe(0);
  });

  it('throws when the result is not a safe integer', () => {
    expect(() => mulMinor(dec('1000000000000'), 1_000_000_000)).toThrow();
  });
});

describe('percentOfMinor', () => {
  it('rounds half up', () => {
    expect(percentOfMinor(83250, dec('19'))).toBe(15818);
    expect(percentOfMinor(1000, dec('7'))).toBe(70);
    expect(percentOfMinor(-83250, dec('19'))).toBe(-15818);
  });
});

describe('formatMinor', () => {
  it('writes two decimals without a symbol', () => {
    expect(formatMinor(12500, 'EUR')).toBe('125.00');
    expect(formatMinor(5, 'EUR')).toBe('0.05');
    expect(formatMinor(-12505, 'EUR')).toBe('-125.05');
  });
});
