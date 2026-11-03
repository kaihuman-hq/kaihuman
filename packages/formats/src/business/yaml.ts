import { isScalar, parseDocument, stringify } from 'yaml';
import type { Issue, Result } from './validate-kit.js';

const parse = (text: string) =>
  parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true });

const errorsOf = (doc: ReturnType<typeof parse>): Issue[] =>
  doc.errors.map((e) => ({
    path: '',
    message: e.message,
    ...(e.linePos?.[0] ? { line: e.linePos[0].line } : {}),
  }));

/** YAML 1.2 core schema, so `no` and `2026-10-26` stay strings; duplicate keys are errors. */
export const parseYaml = (text: string): Result<unknown> => {
  const doc = parse(text.replace(/^\uFEFF/, ''));
  if (doc.errors.length > 0) return { ok: false, issues: errorsOf(doc) };
  return { ok: true, value: doc.toJS() };
};

/**
 * Sets scalar values in a file a person may have edited, keeping its comments, key order and
 * quoting: an existing scalar keeps its style and only its value changes.
 */
export const editYaml = (
  text: string,
  edits: readonly { path: readonly string[]; value: string }[],
): Result<string> => {
  const doc = parse(text);
  if (doc.errors.length > 0) return { ok: false, issues: errorsOf(doc) };
  for (const { path, value } of edits) {
    const node = doc.getIn(path, true);
    if (isScalar(node)) node.value = value;
    else doc.setIn(path, value);
  }
  return { ok: true, value: doc.toString({ lineWidth: 0 }) };
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
