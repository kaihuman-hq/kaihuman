import type { WikiSegment } from '../screens/wiki-screen.js';

type Inline = WikiSegment;

/** One rendered block of a wiki page body. Inline wikilinks survive inside every kind. */
export type WikiBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'bullet'; marker: string; depth: number; inlines: Inline[] }
  | { kind: 'quote'; inlines: Inline[] }
  | { kind: 'code'; text: string };

// The reader shows the body; frontmatter is metadata already surfaced as title and tags.
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const HEADING = /^(#{1,6})\s+/;
const BULLET = /^(\s*)([-*+])\s+(\[[ xX]\]\s+)?/;
const ORDERED = /^(\s*)(\d+[.)])\s+/;
const QUOTE = /^>\s?/;
const FENCE = /^(```|~~~)/;

/** Splits link/text segments into lines, each a list of inlines. */
function toLines(segments: readonly WikiSegment[]): Inline[][] {
  const lines: Inline[][] = [[]];
  segments.forEach((seg, i) => {
    if (seg.type === 'link') {
      lines[lines.length - 1]?.push(seg);
      return;
    }
    const text = i === 0 ? seg.text.replace(FRONTMATTER, '') : seg.text;
    text.split(/\r?\n/).forEach((part, j) => {
      if (j > 0) lines.push([]);
      if (part) lines[lines.length - 1]?.push({ type: 'text', text: part });
    });
  });
  return lines;
}

const plain = (line: Inline[]) => line.map((s) => (s.type === 'text' ? s.text : s.label)).join('');

/** Drops a prefix of `n` characters from the start of a line's inlines. */
function dropPrefix(line: Inline[], n: number): Inline[] {
  const first = line[0];
  if (!first || first.type !== 'text' || n === 0) return line;
  const rest = first.text.slice(n);
  return rest ? [{ type: 'text', text: rest }, ...line.slice(1)] : line.slice(1);
}

const firstText = (line: Inline[]) => (line[0]?.type === 'text' ? line[0].text : '');

/** Minimal Markdown block parser for the wiki reader: headings, lists, quotes, code, paragraphs. */
export function wikiBlocks(segments: readonly WikiSegment[]): WikiBlock[] {
  const blocks: WikiBlock[] = [];
  let para: Inline[] | null = null;
  let code: string[] | null = null;
  const flush = () => {
    if (para?.length) blocks.push({ kind: 'paragraph', inlines: para });
    para = null;
  };
  for (const line of toLines(segments)) {
    const head = firstText(line);
    if (code) {
      if (FENCE.test(plain(line).trim())) {
        blocks.push({ kind: 'code', text: code.join('\n') });
        code = null;
      } else code.push(plain(line));
      continue;
    }
    if (FENCE.test(head.trim())) {
      flush();
      code = [];
      continue;
    }
    if (plain(line).trim() === '') {
      flush();
      continue;
    }
    const h = HEADING.exec(head);
    if (h?.[1]) {
      flush();
      const level = Math.min(h[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, inlines: dropPrefix(line, h[0].length) });
      continue;
    }
    const b = BULLET.exec(head) ?? ORDERED.exec(head);
    if (b) {
      flush();
      const marker = /^\d/.test(b[2] ?? '') ? (b[2] ?? '') : '•';
      const depth = Math.min(Math.floor((b[1] ?? '').length / 2), 3);
      blocks.push({ kind: 'bullet', marker, depth, inlines: dropPrefix(line, b[0].length) });
      continue;
    }
    if (QUOTE.test(head)) {
      flush();
      blocks.push({
        kind: 'quote',
        inlines: dropPrefix(line, (QUOTE.exec(head)?.[0] ?? '').length),
      });
      continue;
    }
    // Soft line breaks inside a paragraph read as spaces, as in rendered Markdown.
    if (para) para.push({ type: 'text', text: ' ' }, ...line);
    else para = [...line];
  }
  if (code) blocks.push({ kind: 'code', text: (code as string[]).join('\n') });
  flush();
  return blocks;
}

/**
 * Pages usually open with `# Title`. Showing it under the page title would repeat it, so a
 * leading H1 that matches the title (ignoring case) replaces the title and leaves the body.
 */
export function withoutTitleHeading(
  title: string,
  blocks: WikiBlock[],
): { title: string; blocks: WikiBlock[] } {
  const first = blocks[0];
  if (first?.kind !== 'heading' || first.level !== 1) return { title, blocks };
  const text = plain(first.inlines).trim();
  return text.toLowerCase() === title.trim().toLowerCase()
    ? { title: text, blocks: blocks.slice(1) }
    : { title, blocks };
}
