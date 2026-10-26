import { ISSUED_NUMBER } from './paths.js';
import type { DocKind } from './records.js';

export const DEFAULT_NUMBERING = {
  invoice: 'RE-{yyyy}-{nnnn}',
  offer: 'AN-{yyyy}-{nnn}',
} as const;

/** Credit notes share the invoice series, so the numbers stay gap-free per series. */
export const seriesOf = (kind: DocKind): 'invoice' | 'offer' =>
  kind === 'offer' ? 'offer' : 'invoice';

const PLACEHOLDER = /\{yyyy\}|\{n+\}/g;

export const formatNumber = (pattern: string, year: number, seq: number): string =>
  pattern.replace(PLACEHOLDER, (token) =>
    token === '{yyyy}'
      ? String(year).padStart(4, '0')
      : String(seq).padStart(token.length - 2, '0'),
  );

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Builds a matcher whose groups are the year and the sequence, in pattern order. */
const matcher = (pattern: string): { regex: RegExp; order: ('year' | 'seq')[] } => {
  const order: ('year' | 'seq')[] = [];
  let source = '';
  let last = 0;
  for (const m of pattern.matchAll(PLACEHOLDER)) {
    source += escapeRegExp(pattern.slice(last, m.index));
    const isYear = m[0] === '{yyyy}';
    order.push(isYear ? 'year' : 'seq');
    source += isYear ? '(\\d{4})' : '(\\d+)';
    last = m.index + m[0].length;
  }
  source += escapeRegExp(pattern.slice(last));
  return { regex: new RegExp(`^${source}$`), order };
};

const LITERAL = /^[A-Za-z0-9_-]*$/;

/**
 * Exactly one `{yyyy}` and one `{n…}`, else numbers are not unique and increasing; literal text
 * only from `[A-Za-z0-9_-]`, so every number is a valid issued file name (`ISSUED_NUMBER`) and the
 * check can find, validate and freeze it.
 */
export const isValidPattern = (pattern: string): boolean =>
  (pattern.match(/\{yyyy\}/g) ?? []).length === 1 &&
  (pattern.match(/\{n+\}/g) ?? []).length === 1 &&
  LITERAL.test(pattern.replace(PLACEHOLDER, '')) &&
  ISSUED_NUMBER.test(formatNumber(pattern, 2026, 1));

/** Accepts any width: the width is a minimum for formatting only, so hand-typed `RE-2026-42` still counts as 42. */
export const parseNumber = (
  pattern: string,
  number: string,
): { year: number; seq: number } | null => {
  const { regex, order } = matcher(pattern);
  const m = regex.exec(number);
  if (!m) return null;
  const year = Number(m[order.indexOf('year') + 1]);
  const seq = Number(m[order.indexOf('seq') + 1]);
  return Number.isSafeInteger(seq) && order.includes('year') && order.includes('seq')
    ? { year, seq }
    : null;
};

const sequencesOf = (pattern: string, year: number, existing: readonly string[]): number[] =>
  existing.flatMap((n) => {
    const p = parseNumber(pattern, n);
    return p && p.year === year ? [p.seq] : [];
  });

/** Highest number of that year plus one; other years and foreign formats are ignored. */
export const nextNumber = (pattern: string, year: number, existing: readonly string[]): string =>
  formatNumber(pattern, year, Math.max(0, ...sequencesOf(pattern, year, existing)) + 1);

/** Sequence numbers missing between 1 and the highest one of that year. */
export const findGaps = (pattern: string, year: number, existing: readonly string[]): number[] => {
  const seqs = new Set(sequencesOf(pattern, year, existing));
  const max = Math.max(0, ...seqs);
  return Array.from({ length: max }, (_, i) => i + 1).filter((s) => !seqs.has(s));
};
