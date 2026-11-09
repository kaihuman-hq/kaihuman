import { parseCsv } from '@kaihuman/formats';
import { tokenizeWikiLinks } from '../screens/wiki-screen.js';
import { type WikiBlock, wikiBlocks } from '../views/wiki-blocks.js';

export interface CsvView {
  header: string[];
  rows: string[][];
  rowCount: number;
  truncated: boolean;
}

/** `rowCount` counts data rows (header excluded); `rows` holds at most `maxRows` of them. */
export const csvView = (content: string, path: string, maxRows = 200): CsvView => {
  const all = parseCsv(content, path.toLowerCase().endsWith('.tsv') ? '\t' : ',');
  const [header = [], ...rows] = all;
  return {
    header,
    rows: rows.slice(0, maxRows),
    rowCount: rows.length,
    truncated: rows.length > maxRows,
  };
};

export type JsonView = { ok: true; pretty: string; summary: string } | { ok: false; error: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const jsonView = (content: string): JsonView => {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
  const summary = Array.isArray(value)
    ? `Array · ${plural(value.length, 'item')}`
    : value !== null && typeof value === 'object'
      ? `Object · ${plural(Object.keys(value).length, 'key')}`
      : value === null
        ? 'null'
        : typeof value;
  return { ok: true, pretty: JSON.stringify(value, null, 2), summary };
};

export interface YamlLine {
  indent: number;
  key: string | null;
  value: string;
  comment: boolean;
  listItem: boolean;
}

/** A line-level view for reading: no YAML semantics, just indentation, keys and values. */
export const yamlView = (content: string): YamlLine[] =>
  content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line): YamlLine => {
      const indent = line.length - line.trimStart().length;
      const text = line.trim();
      if (text.startsWith('#'))
        return { indent, key: null, value: text, comment: true, listItem: false };
      const listItem = text === '-' || text.startsWith('- ');
      const body = listItem ? text.slice(1).trim() : text;
      const m = /^("[^"]*"|'[^']*'|[^\s:#][^:#]*?):(?:\s+(.*))?$/.exec(body);
      if (m) {
        return { indent, key: m[1] ?? null, value: (m[2] ?? '').trim(), comment: false, listItem };
      }
      return { indent, key: null, value: body, comment: false, listItem };
    });

export const markdownBlocks = (content: string): WikiBlock[] =>
  wikiBlocks(tokenizeWikiLinks(content));
