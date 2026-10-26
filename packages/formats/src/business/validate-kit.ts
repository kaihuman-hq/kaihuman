/** Small field readers: each pushes to `issues` and returns the value, or `undefined` when invalid. */

import { asSlug, isUlid, type Slug, type Ulid } from './ids.js';
import { parseDecimal } from './money.js';

export type Issue = { path: string; message: string; line?: number };
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const describe = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v;

const fail = (issues: Issue[], path: string, message: string): undefined => {
  issues.push({ path, message: `${path}: ${message}` });
  return undefined;
};

/** Reports every key outside `known` as `unknown key "<k>"`. */
export const obj = (
  raw: unknown,
  path: string,
  known: readonly string[],
  issues: Issue[],
): Record<string, unknown> | undefined => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail(issues, path, `expected a mapping, got ${describe(raw)}`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) {
      issues.push({ path: path ? `${path}.${key}` : key, message: `unknown key "${key}"` });
    }
  }
  return record;
};

export const str = (raw: unknown, path: string, issues: Issue[]): string | undefined =>
  typeof raw === 'string' && raw !== ''
    ? raw
    : typeof raw === 'number'
      ? fail(issues, path, `quote it, e.g. "${raw}"`)
      : fail(issues, path, 'expected a non-empty string');

export const optStr = (raw: unknown, path: string, issues: Issue[]): string | undefined =>
  raw === undefined || raw === null
    ? undefined
    : typeof raw === 'string'
      ? raw
      : fail(issues, path, 'expected a string');

export const int = (raw: unknown, path: string, issues: Issue[]): number | undefined =>
  typeof raw === 'number' && Number.isSafeInteger(raw)
    ? raw
    : fail(issues, path, 'expected an integer');

/** Decimals are strings, so a YAML number is an error rather than a silent float. */
export const decimalStr = (raw: unknown, path: string, issues: Issue[]): string | undefined => {
  if (typeof raw === 'number') return fail(issues, path, `quote it, e.g. "${raw}"`);
  if (typeof raw === 'string' && parseDecimal(raw)) return raw;
  return fail(issues, path, 'expected a decimal string such as "7.5"');
};

export const date = (raw: unknown, path: string, issues: Issue[]): string | undefined => {
  if (typeof raw === 'string' && DATE.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().startsWith(raw)) return raw;
  }
  return fail(issues, path, 'expected a date as YYYY-MM-DD');
};

export const oneOf =
  <T extends string>(values: readonly T[]) =>
  (raw: unknown, path: string, issues: Issue[]): T | undefined =>
    typeof raw === 'string' && (values as readonly string[]).includes(raw)
      ? (raw as T)
      : fail(issues, path, `expected one of ${values.join(', ')}`);

export const slug = (raw: unknown, path: string, issues: Issue[]): Slug | undefined =>
  (typeof raw === 'string' ? asSlug(raw) : null) ??
  fail(issues, path, 'expected a slug: lowercase letters, digits and dashes, 2-40 characters');

export const ulidField = (raw: unknown, path: string, issues: Issue[]): Ulid | undefined =>
  typeof raw === 'string' && isUlid(raw) ? raw : fail(issues, path, 'expected a ULID');

export const arr = (raw: unknown, path: string, issues: Issue[]): unknown[] | undefined =>
  Array.isArray(raw) ? raw : fail(issues, path, `expected a list, got ${describe(raw)}`);
