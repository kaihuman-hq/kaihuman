/**
 * Money is integer minor units (`12500` = 125.00) with the currency kept on the record; quantities
 * and rates are decimals. Both stay exact: a `Decimal` is a `bigint` and a scale, never a float.
 */

/** `units / 10^scale`: `7.5` is `{ units: 75n, scale: 1 }`. */
export type Decimal = { readonly units: bigint; readonly scale: number };

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Plain decimals only: no exponent, no comma, no sign other than `-`. */
export const parseDecimal = (text: string): Decimal | null => {
  if (!DECIMAL.test(text)) return null;
  const dot = text.indexOf('.');
  if (dot === -1) return { units: BigInt(text), scale: 0 };
  return { units: BigInt(text.slice(0, dot) + text.slice(dot + 1)), scale: text.length - dot - 1 };
};

/** Keeps the scale, so `7.50` reads back as `7.50`. */
export const formatDecimal = ({ units, scale }: Decimal): string => {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const cut = digits.length - scale;
  const body = scale === 0 ? digits : `${digits.slice(0, cut)}.${digits.slice(cut)}`;
  return negative ? `-${body}` : body;
};

/** `numerator / denominator` rounded half up, away from zero (kaufmännisch). */
const divRound = (numerator: bigint, denominator: bigint): bigint => {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (2n * abs + denominator) / (2n * denominator);
  return negative ? -rounded : rounded;
};

const toSafeInteger = (value: bigint): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${value} is not a safe integer amount`);
  }
  return Number(value);
};

const pow10 = (exponent: number): bigint => 10n ** BigInt(exponent);

/** Quantity times a price in minor units, e.g. 7.5 hours at 95.00. */
export const mulMinor = (qty: Decimal, minor: number): number =>
  toSafeInteger(divRound(qty.units * BigInt(minor), pow10(qty.scale)));

/** A percentage of an amount, e.g. 19 % VAT on a net sum. */
export const percentOfMinor = (minor: number, rate: Decimal): number =>
  toSafeInteger(divRound(BigInt(minor) * rate.units, 100n * pow10(rate.scale)));

/**
 * `12500` as `"125.00"`, with no currency symbol. Every currency the business module supports has
 * two decimals, so `currency` is not read yet; it is in the signature so a zero-decimal currency
 * can be added without changing callers.
 */
export const formatMinor = (minor: number, _currency: string): string =>
  formatDecimal({ units: BigInt(minor), scale: 2 });
