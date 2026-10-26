import type { Issue, Result } from './validate-kit.js';

const serialize = (entry: object, keyOrder: readonly string[]): string => {
  const rest = Object.keys(entry)
    .filter((k) => !keyOrder.includes(k))
    .sort();
  const out = new Map<string, unknown>();
  for (const k of [...keyOrder, ...rest]) {
    const v = (entry as Record<string, unknown>)[k];
    if (v !== undefined) out.set(k, v);
  }
  return JSON.stringify(Object.fromEntries(out));
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const BOM = '\uFEFF';

/** Tolerates a leading BOM, CRLF, blank lines and a missing final newline; `line` is 1-based. */
export const parseJsonl = <T>(
  text: string,
  validate: (raw: unknown, path: string) => Result<T>,
): { entries: { line: number; value: T }[]; issues: Issue[] } => {
  const entries: { line: number; value: T }[] = [];
  const issues: Issue[] = [];
  text.split('\n').forEach((rawLine, i) => {
    const line = i + 1;
    const body = (i === 0 ? rawLine.replace(/^\uFEFF/, '') : rawLine).replace(/\r$/, '');
    if (body.trim() === '') return;
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch (e) {
      issues.push({ path: `line ${line}`, message: (e as Error).message, line });
      return;
    }
    const r = validate(raw, `line ${line}`);
    if (r.ok) entries.push({ line, value: r.value });
    else for (const issue of r.issues) issues.push({ ...issue, line: issue.line ?? line });
  });
  return { entries, issues };
};

/** One entry per line, whatever the file ended with. */
export const appendJsonl = (text: string, entry: object, keyOrder: readonly string[]): string =>
  `${text === '' || text.endsWith('\n') ? text : `${text}\n`}${serialize(entry, keyOrder)}\n`;

/**
 * Only lines whose callback returns an object are rewritten; the rest stay byte-for-byte, and a
 * leading BOM is kept in front of line 1.
 */
export const replaceJsonlLines = (
  text: string,
  replace: (raw: Record<string, unknown>, line: number) => Record<string, unknown> | null,
  keyOrder: readonly string[],
): string =>
  text
    .split('\n')
    .map((rawLine, i) => {
      const bom = i === 0 && rawLine.startsWith(BOM) ? BOM : '';
      const cr = rawLine.endsWith('\r') ? '\r' : '';
      const body = rawLine.slice(bom.length, cr ? -1 : undefined);
      if (body.trim() === '') return rawLine;
      let raw: unknown;
      try {
        raw = JSON.parse(body);
      } catch {
        return rawLine;
      }
      if (!isRecord(raw)) return rawLine;
      const next = replace(raw, i + 1);
      return next ? bom + serialize(next, keyOrder) + cr : rawLine;
    })
    .join('\n');
