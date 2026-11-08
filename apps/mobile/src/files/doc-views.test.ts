import { describe, expect, it } from 'vitest';
import { csvView, jsonView, markdownBlocks, yamlView } from './doc-views.js';

describe('csvView', () => {
  it('splits header and rows and truncates', () => {
    const v = csvView('a,b\n1,2\n3,4\n5,6\n', 'x.csv', 2);
    expect(v).toEqual({
      header: ['a', 'b'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
      rowCount: 3,
      truncated: true,
    });
  });
  it('uses tabs for .tsv and handles empty files', () => {
    expect(csvView('a\tb\n1\t2', 'x.TSV').rows).toEqual([['1', '2']]);
    expect(csvView('', 'x.csv')).toEqual({ header: [], rows: [], rowCount: 0, truncated: false });
  });
});

describe('jsonView', () => {
  it('pretty prints and summarises', () => {
    expect(jsonView('{"a":1,"b":[1]}')).toEqual({
      ok: true,
      pretty: '{\n  "a": 1,\n  "b": [\n    1\n  ]\n}',
      summary: 'Object · 2 keys',
    });
    expect(jsonView('[1,2,3]')).toMatchObject({ summary: 'Array · 3 items' });
    expect(jsonView('[1]')).toMatchObject({ summary: 'Array · 1 item' });
  });
  it('reports parse errors', () => {
    const v = jsonView('{x');
    expect(v.ok).toBe(false);
  });
});

describe('yamlView', () => {
  it('reads keys, values, lists and comments', () => {
    const lines = yamlView(
      '# top\nname: Kai\nitems:\n  - one\n  - id: 2\n    url: "http://x"\n\nplain',
    );
    expect(lines[0]).toMatchObject({ comment: true, value: '# top' });
    expect(lines[1]).toMatchObject({ indent: 0, key: 'name', value: 'Kai' });
    expect(lines[2]).toMatchObject({ key: 'items', value: '' });
    expect(lines[3]).toMatchObject({ indent: 2, listItem: true, key: null, value: 'one' });
    expect(lines[4]).toMatchObject({ listItem: true, key: 'id', value: '2' });
    expect(lines[5]).toMatchObject({ indent: 4, key: 'url', value: '"http://x"' });
    expect(lines[6]).toMatchObject({ key: null, value: 'plain' });
  });
});

describe('markdownBlocks', () => {
  it('produces wiki blocks', () => {
    const blocks = markdownBlocks('# Title\n\nHello [[Page]]');
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(blocks.some((b) => b.kind === 'paragraph')).toBe(true);
  });
});
