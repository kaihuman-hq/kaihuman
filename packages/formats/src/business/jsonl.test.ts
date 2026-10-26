import { describe, expect, it } from 'vitest';
import { asSlug } from './ids.js';
import { appendJsonl, parseJsonl, replaceJsonlLines } from './jsonl.js';
import { arr, date, decimalStr, type Issue, obj, type Result, slug, str } from './validate-kit.js';

const okValidator = (raw: unknown): Result<unknown> => ({ ok: true, value: raw });
const text = '{"id":"a"}\r\n\r\n{"id":"b"}'; // CRLF, blank line, no final newline

describe('jsonl', () => {
  it('parses CRLF and blank lines with correct line numbers', () => {
    const r = parseJsonl(text, okValidator);
    expect(r.issues).toEqual([]);
    expect(r.entries.map((e) => [e.line, (e.value as { id: string }).id])).toEqual([
      [1, 'a'],
      [3, 'b'],
    ]);
  });

  it('reports bad JSON with its line', () => {
    expect(parseJsonl('{bad\n', okValidator).issues[0]).toMatchObject({ line: 1 });
  });

  it('adds the line to validator issues', () => {
    const r = parseJsonl('{"id":1}\n', () => ({
      ok: false,
      issues: [{ path: 'id', message: 'no' }],
    }));
    expect(r.issues[0]).toMatchObject({ path: 'id', line: 1 });
  });

  it('appends one entry per line, in key order', () => {
    expect(appendJsonl(text, { id: 'c' }, ['id']).endsWith('{"id":"b"}\n{"id":"c"}\n')).toBe(true);
    expect(appendJsonl('', { b: 1, id: 'c', a: 2 }, ['id'])).toBe('{"id":"c","a":2,"b":1}\n');
  });

  it('replaces only returned lines and leaves the rest byte-for-byte', () => {
    expect(
      replaceJsonlLines(
        '{"id":"a"}\n{"id":"b"}\n',
        (o) => (o.id === 'b' ? { ...o, invoice: 'RE-1' } : null),
        ['id'],
      ),
    ).toBe('{"id":"a"}\n{"id":"b","invoice":"RE-1"}\n');
    expect(
      replaceJsonlLines(
        '{ "id": "a" }\r\n\r\n{"id":"b"}',
        (o) => (o.id === 'b' ? { id: 'B' } : null),
        ['id'],
      ),
    ).toBe('{ "id": "a" }\r\n\r\n{"id":"B"}');
  });

  it('ignores a leading byte order mark on line 1', () => {
    const bom = '\uFEFF{"id":"a"}\n{"id":"b"}\n';
    const r = parseJsonl(bom, (raw) => ({ ok: true, value: raw as { id: string } }));
    expect(r.issues).toEqual([]);
    expect(r.entries.map((e) => [e.line, e.value.id])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    const seen: unknown[] = [];
    const untouched = replaceJsonlLines(
      bom,
      (o) => {
        seen.push(o.id);
        return null;
      },
      ['id'],
    );
    expect(seen).toEqual(['a', 'b']);
    expect(untouched).toBe(bom);
    expect(replaceJsonlLines(bom, (o) => (o.id === 'a' ? { id: 'A' } : null), ['id'])).toBe(
      '\uFEFF{"id":"A"}\n{"id":"b"}\n',
    );
  });
});

describe('validate-kit', () => {
  it('tells the user to quote a numeric decimal', () => {
    const issues: Issue[] = [];
    expect(decimalStr(19, 'lines[0].vat_rate', issues)).toBeUndefined();
    expect(issues[0]?.message).toBe('lines[0].vat_rate: quote it, e.g. "19"');
    expect(decimalStr('7.5', 'q', issues)).toBe('7.5');
  });

  it('tells the user to quote a number where a string is expected', () => {
    const issues: Issue[] = [];
    expect(str(10115, 'address.postcode', issues)).toBeUndefined();
    expect(issues[0]?.message).toBe('address.postcode: quote it, e.g. "10115"');
  });

  it('reports unknown keys', () => {
    const issues: Issue[] = [];
    obj({ a: 1, z: 2 }, 'x', ['a'], issues);
    expect(issues.some((i) => i.message === 'unknown key "z"')).toBe(true);
    expect(issues[0]?.path).toBe('x.z');
  });

  it('validates dates, slugs and lists', () => {
    const issues: Issue[] = [];
    expect(date('2026-10-26', 'd', issues)).toBe('2026-10-26');
    expect(date('2026-02-30', 'd', issues)).toBeUndefined();
    expect(date('26.10.2026', 'd', issues)).toBeUndefined();
    expect(slug('acme-gmbh', 's', issues)).toBe(asSlug('acme-gmbh'));
    expect(slug('Acme', 's', issues)).toBeUndefined();
    expect(arr('x', 'a', issues)).toBeUndefined();
    expect(issues).toHaveLength(4);
  });
});
