export type FrontmatterValue = string | boolean | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedDocument {
  data: Frontmatter;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_LINE = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/;
const LIST_ITEM = /^[ \t]+-[ \t]+(.*)$/;

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** Splits an inline YAML array body on commas that are not inside quotes. */
function splitInlineArray(inner: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      items.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  items.push(current);
  return items.map(unquote).filter((item) => item.length > 0);
}

function parseScalar(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) return splitInlineArray(value.slice(1, -1));
  if (value === 'true') return true;
  if (value === 'false') return false;
  return unquote(value);
}

/**
 * Minimal frontmatter parser covering what the KB tooling writes:
 * `key: value`, inline arrays `[a, b]`, block lists (`- a`), quoted strings and booleans.
 */
export function parseFrontmatter(text: string): ParsedDocument {
  const match = FENCE.exec(text);
  if (!match) return { data: {}, body: text };

  const data: Frontmatter = {};
  let listKey: string | null = null;
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const item = LIST_ITEM.exec(line);
    if (item && listKey) {
      const list = data[listKey];
      if (Array.isArray(list)) list.push(unquote(item[1] ?? ''));
      continue;
    }
    const kv = KEY_LINE.exec(line);
    if (!kv) continue;
    const key = kv[1] as string;
    const rawValue = kv[2] ?? '';
    if (rawValue.trim() === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalar(rawValue);
      listKey = null;
    }
  }
  return { data, body: text.slice(match[0].length) };
}

export function getString(data: Frontmatter, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

export function getStringArray(data: Frontmatter, key: string): string[] {
  const value = data[key];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}
