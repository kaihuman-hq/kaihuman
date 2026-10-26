import { describe, expect, it } from 'vitest';
import { parseYaml, stringifyYaml } from './yaml.js';

describe('parseYaml', () => {
  it('rejects duplicate keys, with a line', () => {
    const r = parseYaml('a: 1\na: 2\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.line).toBe(2);
  });

  it('reports syntax errors with a line', () => {
    const r = parseYaml('a: 1\nb: [1, 2\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.line).toBeGreaterThan(0);
  });

  it('keeps dates and "no" as strings (YAML 1.2 core)', () => {
    expect(parseYaml('d: 2026-10-26\nno: no\n')).toEqual({
      ok: true,
      value: { d: '2026-10-26', no: 'no' },
    });
  });

  it('strips a BOM', () => {
    expect(parseYaml('\uFEFFa: 1\n')).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe('stringifyYaml', () => {
  it('puts keyOrder first, then the rest alphabetically', () => {
    expect(stringifyYaml({ b: 1, a: 'x', number: 'RE-1' }, ['number'])).toBe(
      'number: RE-1\na: x\nb: 1\n',
    );
  });

  it('sorts nested objects, including inside lists', () => {
    expect(stringifyYaml({ l: [{ z: 1, a: 2 }], n: { y: 1, x: 2 } }, [])).toBe(
      'l:\n  - a: 2\n    z: 1\nn:\n  x: 2\n  y: 1\n',
    );
  });

  it('quotes strings that would re-parse as another type', () => {
    const value = { v: '19', d: '2026-01-01', t: 'true', n: 'null', f: '7.5' };
    const text = stringifyYaml(value, []);
    expect(text).toContain('v: "19"');
    expect(parseYaml(text)).toEqual({ ok: true, value });
  });

  it('uses LF and ends with a newline', () => {
    const text = stringifyYaml({ a: 'x\ny' }, []);
    expect(text).not.toContain('\r');
    expect(text.endsWith('\n')).toBe(true);
  });
});
