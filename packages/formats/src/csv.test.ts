import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses plain rows and ignores a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('handles quotes, escapes, CRLF and newlines in quotes', () => {
    expect(parseCsv('a,"b,""c"""\r\n"x\ny",\r\n')).toEqual([
      ['a', 'b,"c"'],
      ['x\ny', ''],
    ]);
  });
  it('supports other delimiters and empty input', () => {
    expect(parseCsv('a\tb', '\t')).toEqual([['a', 'b']]);
    expect(parseCsv('')).toEqual([]);
  });
  it('keeps empty trailing fields and blank lines as single empty rows', () => {
    expect(parseCsv('a,\n\nb')).toEqual([['a', ''], [''], ['b']]);
  });
});
