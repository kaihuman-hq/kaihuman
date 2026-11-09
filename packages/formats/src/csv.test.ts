import { describe, expect, it } from 'vitest';
import {
  csvCellText,
  filterCsvRows,
  isComplexCell,
  nextCsvSort,
  pageCsvRows,
  parseCsv,
  parseCsvTable,
  setCsvFilter,
  sortCsvRows,
} from './csv.js';

describe('csv table logic', () => {
  it('strips header metadata and detects ; vs ,', () => {
    expect(parseCsvTable('Name[title:X;unit:Y],Qty\na,1\n\nb,2')).toEqual({
      headers: ['Name', 'Qty'],
      rows: [
        ['a', '1'],
        ['b', '2'],
      ],
    });
    expect(parseCsvTable('A;B\n1,5;2').rows).toEqual([['1,5', '2']]);
    expect(parseCsvTable('a\tb\n1\t2', '\t').headers).toEqual(['a', 'b']);
    expect(parseCsvTable('')).toEqual({ headers: [], rows: [] });
  });
  const rows = [
    ['b', '10'],
    ['a', '9'],
    ['c', '100'],
  ];
  it('sorts numerically when possible and flips direction', () => {
    expect(sortCsvRows(rows, { key: 1, direction: 'asc' }).map((r) => r[1])).toEqual([
      '9',
      '10',
      '100',
    ]);
    expect(sortCsvRows(rows, { key: 0, direction: 'desc' }).map((r) => r[0])).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect(sortCsvRows(rows, null)).toEqual(rows);
    const s = nextCsvSort(null, 0);
    expect(s).toEqual({ key: 0, direction: 'asc' });
    expect(nextCsvSort(s, 0).direction).toBe('desc');
    expect(nextCsvSort(nextCsvSort(s, 0), 0).direction).toBe('asc');
    expect(nextCsvSort(s, 1)).toEqual({ key: 1, direction: 'asc' });
  });
  it('filters case-insensitively across columns and clears empty filters', () => {
    expect(filterCsvRows(rows, { 0: 'A' })).toEqual([['a', '9']]);
    expect(filterCsvRows(rows, { 0: 'a', 1: '1' })).toEqual([]);
    expect(setCsvFilter({ 0: 'x' }, 0, '')).toEqual({});
    expect(setCsvFilter({}, 1, 'y')).toEqual({ 1: 'y' });
  });
  it('pages by 50 and clamps', () => {
    const many = Array.from({ length: 120 }, (_, i) => [String(i)]);
    expect(pageCsvRows(many, 0).rows).toHaveLength(50);
    expect(pageCsvRows(many, 2).rows).toHaveLength(20);
    expect(pageCsvRows(many, 9)).toMatchObject({ page: 2, totalPages: 3 });
    expect(pageCsvRows([], 3)).toMatchObject({ page: 0, totalPages: 1 });
  });
  it('shows complex cells as clipped JSON', () => {
    expect(csvCellText({ a: 1 })).toBe('{"a":1}');
    expect(csvCellText(undefined)).toBe('');
    expect(csvCellText({ k: 'x'.repeat(100) })).toHaveLength(61);
    expect(isComplexCell([1])).toBe(true);
  });
});

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
