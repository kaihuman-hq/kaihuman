/** A text selection as React Native reports it; `start === end` is a caret. */
export interface Selection {
  start: number;
  end: number;
}

export interface TextEdit {
  text: string;
  selection: Selection;
}

/** Wraps the selection in `marker` (bold, italic, code), or unwraps it when already wrapped. */
export function toggleWrap(
  text: string,
  sel: Selection,
  marker: string,
  placeholder: string,
): TextEdit {
  const m = marker.length;
  const before = text.slice(sel.start - m, sel.start);
  const after = text.slice(sel.end, sel.end + m);
  if (before === marker && after === marker) {
    return {
      text: text.slice(0, sel.start - m) + text.slice(sel.start, sel.end) + text.slice(sel.end + m),
      selection: { start: sel.start - m, end: sel.end - m },
    };
  }
  const inner = text.slice(sel.start, sel.end) || placeholder;
  return {
    text: text.slice(0, sel.start) + marker + inner + marker + text.slice(sel.end),
    selection: { start: sel.start + m, end: sel.start + m + inner.length },
  };
}

export type LinePrefix = 'heading' | 'bullet' | 'task';

const PREFIX = /^(\s*)(#{1,6} +|[-*+] +\[[ xX]\] +|[-*+] +|\d+\. +)?/;

const prefixKind = (p: string | undefined): LinePrefix | null => {
  if (!p) return null;
  if (p.startsWith('#')) return 'heading';
  if (/\[[ xX]\]/.test(p)) return 'task';
  return 'bullet';
};

/** Headings cycle # → ## → ### → plain; bullets and tasks toggle. */
const nextPrefix = (kind: LinePrefix, current: string | undefined): string => {
  const was = prefixKind(current);
  if (kind === 'heading') {
    if (was !== 'heading') return '# ';
    const level = (current ?? '').trim().length;
    return level >= 3 ? '' : `${'#'.repeat(level + 1)} `;
  }
  if (was === kind) return '';
  return kind === 'task' ? '- [ ] ' : '- ';
};

/** Applies a line prefix to every line the selection touches. */
export function toggleLinePrefix(text: string, sel: Selection, kind: LinePrefix): TextEdit {
  const from = text.lastIndexOf('\n', sel.start - 1) + 1;
  const nl = text.indexOf('\n', sel.end);
  const to = nl === -1 ? text.length : nl;
  const lines = text.slice(from, to).split('\n');
  let firstDelta = 0;
  let total = 0;
  const out = lines.map((line, i) => {
    const [whole, indent = '', prefix] = line.match(PREFIX) ?? [''];
    const next = indent + nextPrefix(kind, prefix) + line.slice(whole.length);
    const delta = next.length - line.length;
    if (i === 0) firstDelta = delta;
    total += delta;
    return next;
  });
  return {
    text: text.slice(0, from) + out.join('\n') + text.slice(to),
    selection: {
      start: Math.max(from, sel.start + firstDelta),
      end: Math.max(from, sel.end + total),
    },
  };
}

/** Turns the selection into a link; selects the part still to type. */
export function insertLink(text: string, sel: Selection): TextEdit {
  const picked = text.slice(sel.start, sel.end);
  const isUrl = /^https?:\/\/\S+$/.test(picked);
  const label = isUrl ? '' : picked || 'text';
  const url = isUrl ? picked : 'https://';
  const link = `[${label}](${url})`;
  const labelStart = sel.start + 1;
  const urlStart = labelStart + label.length + 2;
  return {
    text: text.slice(0, sel.start) + link + text.slice(sel.end),
    selection:
      isUrl || picked === ''
        ? { start: labelStart, end: labelStart + label.length }
        : { start: urlStart, end: urlStart + url.length },
  };
}

const LIST_ITEM = /^(\s*)([-*+] +\[[ xX]\] +|[-*+] +|(\d+)\. +)(.*)$/;

/**
 * When `next` is `prev` plus one newline typed at the end of a list line, carries the list
 * marker to the new line; on an empty item it ends the list instead. Otherwise null.
 */
export function continueList(prev: string, next: string): TextEdit | null {
  if (next.length !== prev.length + 1) return null;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  // In a run of newlines any position fits; the earliest is the end of the typed-on line.
  while (i > 0 && next[i - 1] === '\n') i--;
  if (next[i] !== '\n' || next.slice(i + 1) !== prev.slice(i)) return null;
  const lineStart = prev.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = prev.indexOf('\n', i);
  // Only at the end of the line: splitting mid-line should behave like a plain newline.
  if (i !== (lineEnd === -1 ? prev.length : lineEnd)) return null;
  const m = prev.slice(lineStart, i).match(LIST_ITEM);
  if (!m) return null;
  const [, indent = '', marker = '', num, rest] = m;
  if (rest?.trim() === '') {
    return { text: prev.slice(0, lineStart) + prev.slice(i), selection: caret(lineStart) };
  }
  const carried = num
    ? `${Number(num) + 1}. `
    : marker.includes('[')
      ? `${marker.trim()[0]} [ ] `
      : marker;
  const insert = `\n${indent}${carried}`;
  return {
    text: prev.slice(0, i) + insert + prev.slice(i),
    selection: caret(i + insert.length),
  };
}

const caret = (at: number): Selection => ({ start: at, end: at });
