import { describe, expect, it } from 'vitest';
import { addCollectionEntry, collectionDetail } from './collection-tile.js';

const NOW = new Date(2026, 10, 9, 12, 0, 0);
const HEADER = 'name::When,type::date;name::Weight,type::number,unit::kg;name::Note,type::text';
const FILE = [
  HEADER,
  '2025-01-10;80;old',
  '2026-02-01;79;feb',
  '2026-06-01;78;jun',
  '2026-10-20;77;oct',
].join('\n');

describe('collectionDetail', () => {
  it('summarises all rows with recent rows newest first', () => {
    const d = collectionDetail(FILE, NOW, 'ALL');
    expect(d.rowCount).toBe(4);
    expect(d.recent[0]).toEqual(['2026-10-20', '77', 'oct']);
    expect(d.series[0]).toMatchObject({
      column: 'Weight',
      unit: 'kg',
      latest: 77,
      min: 77,
      max: 80,
    });
    expect(d.series[0]?.bars).toHaveLength(4);
    expect(d.series[0]?.bars.at(-1)?.label).toBe('2026-10-20');
    expect(d.inputColumns.map((c) => c.name)).toEqual(['When', 'Weight', 'Note']);
  });

  it.each([
    ['6M', 2],
    ['12M', 3],
    ['YTD', 3],
  ] as const)('filters %s', (filter, rows) => {
    const d = collectionDetail(FILE, NOW, filter);
    expect(d.rowCount).toBe(rows);
    expect(d.series[0]?.max).toBeLessThan(80);
  });

  it('ignores the filter when there is no date column', () => {
    const f = 'name::A,type::number\n1\n2';
    expect(collectionDetail(f, NOW, '6M').rowCount).toBe(2);
  });

  it('caps bars at the latest twelve', () => {
    const rows = Array.from(
      { length: 20 },
      (_, i) => `2026-10-${String(i + 1).padStart(2, '0')};${i};x`,
    );
    const d = collectionDetail([HEADER, ...rows].join('\n'), NOW, 'ALL');
    expect(d.series[0]?.bars).toHaveLength(12);
    expect(d.series[0]?.bars.at(-1)?.value).toBe(19);
  });

  it('copes with an empty file', () => {
    expect(collectionDetail('', NOW, 'ALL')).toMatchObject({
      columns: [],
      rowCount: 0,
      series: [],
    });
  });
});

describe('addCollectionEntry', () => {
  const values = { When: '2026-11-09', Weight: '76,5', Note: 'nov' };

  it('appends a row, normalising the decimal comma', () => {
    expect(addCollectionEntry(`${FILE}\n`, values, NOW)).toEqual({
      ok: true,
      content: `${FILE}\n2026-11-09;76.5;nov`,
    });
  });

  it('fills auto columns', () => {
    const header =
      'name::At,type::auto:date;name::A,type::number;name::B,type::number;name::S,type::auto:number:sum;name::M,type::auto:number:avg';
    const r = addCollectionEntry(header, { A: '2', B: '4' }, NOW);
    expect(r.ok && r.content.split('\n')[1]).toBe(`${NOW.toISOString()};2;4;6;3`);
  });

  it('uses the comma separator of spreadsheet-style files', () => {
    const f = 'name::A,type::number;name::B,type::text\n1,x';
    const r = addCollectionEntry(f, { A: '2', B: 'y' }, NOW);
    expect(r.ok && r.content).toBe('name::A,type::number;name::B,type::text\n1,x\n2,y');
  });

  it.each([
    [{ Weight: 'abc' }, 'must be a number'],
    [{ Weight: '' }, 'required'],
    [{ When: '9.11.2026' }, 'date like 2026-11-09'],
    [{ Note: 'a;b' }, 'cannot contain'],
    [{ Note: '' }, 'required'],
  ])('rejects %j', (patch, hint) => {
    const r = addCollectionEntry(FILE, { ...values, ...patch }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(hint);
  });

  it('rejects a file without columns', () => {
    expect(addCollectionEntry('', values, NOW).ok).toBe(false);
  });
});
