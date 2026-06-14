// @vitest-environment node
// Pure logic + CodeMirror state — no DOM required.
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { computeMinimalChange } from './docSync';

describe('computeMinimalChange', () => {
  it('returns null when content is unchanged', () => {
    expect(computeMinimalChange('hello', 'hello')).toBeNull();
  });

  it('produces a minimal change for an edit in the middle', () => {
    // "the quick fox" -> "the slow fox": only "quick" -> "slow" differs.
    expect(computeMinimalChange('the quick fox', 'the slow fox')).toEqual({
      from: 4,
      to: 9,
      insert: 'slow',
    });
  });

  it('produces a pure insertion at the end', () => {
    expect(computeMinimalChange('abc', 'abcdef')).toEqual({ from: 3, to: 3, insert: 'def' });
  });

  it('produces a pure deletion from the start', () => {
    expect(computeMinimalChange('xxabc', 'abc')).toEqual({ from: 0, to: 2, insert: '' });
  });

  it('handles a repeated-character suffix without over-counting', () => {
    // Shared prefix "a", shared suffix "aa"; the middle "b" becomes "c".
    expect(computeMinimalChange('abaa', 'acaa')).toEqual({ from: 1, to: 2, insert: 'c' });
  });
});

describe('cursor preservation (regression: editor cursor jumping to top)', () => {
  // Applying the minimal change through CodeMirror's change mapping must keep
  // the caret where the user left it. A full-document replace would collapse
  // the selection to position 0 — the bug we are fixing.
  function applyExternalUpdate(initial: string, cursor: number, next: string) {
    const state = EditorState.create({
      doc: initial,
      selection: EditorSelection.single(cursor),
    });
    const change = computeMinimalChange(state.doc.toString(), next);
    const transaction = state.update({ changes: change ?? [] });
    return transaction.state.selection.main.head;
  }

  it('keeps the caret in place when an external update changes text after it', () => {
    // Caret after "the " (pos 4); a later word changes. Caret must not move.
    const head = applyExternalUpdate('the quick fox', 4, 'the quick wolf');
    expect(head).toBe(4);
  });

  it('keeps the caret in place when text the user is editing is untouched', () => {
    // User typed and parked the caret at the end of line 1; a background sync
    // appends a trailing newline (a common server normalization).
    const initial = 'first line\nsecond line';
    const head = applyExternalUpdate(initial, 10, `${initial}\n`);
    expect(head).toBe(10);
  });

  it('does not collapse the caret to the top (full-replace would set head to 0)', () => {
    const head = applyExternalUpdate('alpha beta gamma', 16, 'alpha beta GAMMA');
    expect(head).not.toBe(0);
  });
});
