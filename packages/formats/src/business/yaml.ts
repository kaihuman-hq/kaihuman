import { parseDocument, stringify } from 'yaml';
import type { Issue, Result } from './validate-kit.js';

/** YAML 1.2 core schema, so `no` and `2026-10-26` stay strings; duplicate keys are errors. */
export const parseYaml = (text: string): Result<unknown> => {
  const doc = parseDocument(text.replace(/^\uFEFF/, ''), {
    version: '1.2',
    schema: 'core',
    uniqueKeys: true,
  });
  if (doc.errors.length > 0) {
    const issues: Issue[] = doc.errors.map((e) => ({
      path: '',
      message: e.message,
      ...(e.linePos?.[0] ? { line: e.linePos[0].line } : {}),
    }));
    return { ok: false, issues };
  }
  return { ok: true, value: doc.toJS() };
};

/** Maps keep insertion order even for integer-like keys, which plain objects would reorder. */
const ordered = (value: unknown, keyOrder: readonly string[]): unknown => {
  if (Array.isArray(value)) return value.map((v) => ordered(v, []));
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  const rank = (k: string) => {
    const i = keyOrder.indexOf(k);
    return i === -1 ? keyOrder.length : i;
  };
  entries.sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return new Map(entries.map(([k, v]) => [k, ordered(v, [])]));
};

/** `keyOrder` keys lead at the top level; everything else is alphabetical, so diffs stay small. */
export const stringifyYaml = (value: unknown, keyOrder: readonly string[]): string =>
  stringify(ordered(value, keyOrder), { version: '1.2', schema: 'core', lineWidth: 0 });
