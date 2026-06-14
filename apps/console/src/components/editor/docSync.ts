import type { EditorView } from '@codemirror/view';

export interface MinimalChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Compute the smallest single replacement that turns `current` into `next` by
 * keeping the shared leading prefix and trailing suffix untouched.
 *
 * A naive full-document replace (`{ from: 0, to: current.length, insert: next }`)
 * forces CodeMirror to map the cursor across the *entire* document, collapsing
 * any selection to position 0 — the "cursor jumps to the top" bug. Replacing
 * only the region that actually changed lets CodeMirror map the cursor through a
 * localized edit, so a caret that sits outside the changed range stays put.
 *
 * Returns `null` when the two strings are identical (no dispatch needed).
 */
export function computeMinimalChange(current: string, next: string): MinimalChange | null {
  if (current === next) return null;

  const maxPrefix = Math.min(current.length, next.length);

  let prefix = 0;
  while (prefix < maxPrefix && current[prefix] === next[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (
    suffix < maxSuffix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    from: prefix,
    to: current.length - suffix,
    insert: next.slice(prefix, next.length - suffix),
  };
}

/**
 * Replace the editor document with `content` using the minimal change so the
 * user's cursor / selection is preserved instead of jumping to the top. No-op
 * when the content already matches.
 */
export function syncDocPreservingSelection(view: EditorView, content: string): void {
  const change = computeMinimalChange(view.state.doc.toString(), content);
  if (!change) return;
  view.dispatch({ changes: change });
}
