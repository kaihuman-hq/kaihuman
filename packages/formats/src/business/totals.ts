import { formatDecimal, mulMinor, parseDecimal, percentOfMinor } from './money.js';
import type { Line, Totals, VatCategory } from './records.js';

const decimal = (text: string, what: string) => {
  const value = parseDecimal(text);
  if (!value) throw new RangeError(`${what} "${text}" is not a decimal`);
  return value;
};

/** A line's net amount in minor units, rounded on its own. */
export const lineNet = (line: Line): number =>
  mulMinor(decimal(line.quantity, 'quantity'), line.unit_price);

/** Categories with no VAT whatever their rate says. */
const NO_VAT: readonly VatCategory[] = ['E', 'AE', 'K', 'O', 'Z'];

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `"19.0"` → `"19"`, `"7.50"` → `"7.5"`: one text per value, so equal rates form one group. */
const canonicalRate = (text: string): string => {
  let { units, scale } = decimal(text, 'vat_rate');
  while (scale > 0 && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  return formatDecimal({ units, scale });
};

/**
 * Line nets are summed per (category, rate value) and the rate is applied to that sum, so the VAT
 * on an invoice never depends on how it was split into lines. The breakdown rate is written
 * canonically (no trailing zeros) and sorted by category, then rate as text.
 *
 * Frozen: the rounding, grouping, rate text and sort order must never change, because the repo
 * check re-verifies every issued document against this function forever.
 */
export const computeTotals = (
  lines: readonly Line[],
  exemptionReasons: Partial<Record<VatCategory, string>> = {},
): Totals => {
  const groups = new Map<string, { category: VatCategory; rate: string; taxable: number }>();
  for (const line of lines) {
    const rate = canonicalRate(line.vat_rate);
    const key = `${line.vat_category}\u0000${rate}`;
    const group = groups.get(key) ?? { category: line.vat_category, rate, taxable: 0 };
    group.taxable += lineNet(line);
    groups.set(key, group);
  }
  const breakdown: Totals['breakdown'] = [...groups.values()]
    .sort((a, b) => compare(a.category, b.category) || compare(a.rate, b.rate))
    .map(({ category, rate, taxable }) => {
      const tax = NO_VAT.includes(category)
        ? 0
        : percentOfMinor(taxable, decimal(rate, 'vat_rate'));
      const reason = exemptionReasons[category];
      return reason === undefined
        ? { category, rate, taxable, tax }
        : { category, rate, taxable, tax, exemption_reason: reason };
    });
  const net = breakdown.reduce((sum, b) => sum + b.taxable, 0);
  const vat = breakdown.reduce((sum, b) => sum + b.tax, 0);
  return { net, vat, gross: net + vat, breakdown };
};
