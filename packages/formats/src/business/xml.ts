/** Tiny XML writer for the e-invoice serialisers: escaping, indentation and nothing else. */

export type XmlNode = {
  name: string;
  attrs?: Record<string, string>;
  children?: XmlChild[];
  text?: string;
};
export type XmlChild = XmlNode | null | undefined | false | '';

/** An element with child elements; null, undefined and false children are dropped. */
export const el = (
  name: string,
  attrs: Record<string, string> | undefined,
  ...children: XmlChild[]
): XmlNode => ({ name, ...(attrs ? { attrs } : {}), children });

/**
 * An element holding text, or null when there is no text to write. Blank text counts as none: an
 * empty optional element is worse than a missing one, and a blank mandatory one fails either way.
 */
export const txt = (
  name: string,
  text: string | undefined | null,
  attrs?: Record<string, string>,
): XmlNode | null =>
  text === undefined || text === null || text.trim() === ''
    ? null
    : { name, ...(attrs ? { attrs } : {}), text };

/** XML 1.0 allows tab, LF, CR and everything from U+0020 except U+FFFE/U+FFFF (and lone surrogates). */
const legal = (code: number): boolean =>
  code === 0x9 ||
  code === 0xa ||
  code === 0xd ||
  (code >= 0x20 && code <= 0xd7ff) ||
  (code >= 0xe000 && code <= 0xfffd) ||
  code >= 0x10000;

/** Illegal characters are stripped rather than rejected, so one stray control byte in a note cannot block an invoice. */
const strip = (s: string): string => {
  let out = '';
  for (const ch of s) if (legal(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export const escapeXml = (s: string): string =>
  strip(s).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

const open = (node: XmlNode, extra: Record<string, string> = {}): string => {
  const attrs = Object.entries({ ...extra, ...node.attrs })
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');
  return `${node.name}${attrs}`;
};

const write = (
  node: XmlNode,
  depth: number,
  extra: Record<string, string>,
  out: string[],
): void => {
  const pad = '  '.repeat(depth);
  const kids = (node.children ?? []).filter((c): c is XmlNode => !!c);
  if (node.text !== undefined) {
    out.push(`${pad}<${open(node, extra)}>${escapeXml(node.text)}</${node.name}>`);
  } else if (kids.length === 0) {
    out.push(`${pad}<${open(node, extra)}/>`);
  } else {
    out.push(`${pad}<${open(node, extra)}>`);
    for (const k of kids) write(k, depth + 1, {}, out);
    out.push(`${pad}</${node.name}>`);
  }
};

/** `namespaces` maps a prefix to its URI (`''` for the default namespace); they are declared on the root. */
export const renderXml = (root: XmlNode, namespaces: Record<string, string> = {}): string => {
  const decl: Record<string, string> = {};
  for (const [prefix, uri] of Object.entries(namespaces)) {
    decl[prefix === '' ? 'xmlns' : `xmlns:${prefix}`] = uri;
  }
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  write(root, 0, decl, out);
  return `${out.join('\n')}\n`;
};
