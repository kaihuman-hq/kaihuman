import { describe, expect, it } from 'vitest';
import { EditHistory } from './edit-history.js';
import { continueList, insertLink, toggleLinePrefix, toggleWrap } from './markdown-edit.js';

const at = (start: number, end = start) => ({ start, end });

describe('toggleWrap', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(toggleWrap('a word b', at(2, 6), '**', 'bold')).toEqual({
      text: 'a **word** b',
      selection: at(4, 8),
    });
  });
  it('inserts a selected placeholder at a caret', () => {
    expect(toggleWrap('ab', at(1), '_', 'italic')).toEqual({
      text: 'a_italic_b',
      selection: at(2, 8),
    });
  });
  it('unwraps an already wrapped selection', () => {
    expect(toggleWrap('a **word** b', at(4, 8), '**', 'bold')).toEqual({
      text: 'a word b',
      selection: at(2, 6),
    });
  });
});

describe('toggleLinePrefix', () => {
  it('cycles heading levels, then back to plain', () => {
    let e = toggleLinePrefix('Title', at(5), 'heading');
    expect(e).toEqual({ text: '# Title', selection: at(7) });
    e = toggleLinePrefix(e.text, e.selection, 'heading');
    expect(e.text).toBe('## Title');
    e = toggleLinePrefix(e.text, e.selection, 'heading');
    expect(e.text).toBe('### Title');
    e = toggleLinePrefix(e.text, e.selection, 'heading');
    expect(e).toEqual({ text: 'Title', selection: at(5) });
  });
  it('toggles bullets on every selected line, keeping indentation', () => {
    const e = toggleLinePrefix('x\none\n  two\ny', at(2, 11), 'bullet');
    expect(e.text).toBe('x\n- one\n  - two\ny');
    expect(toggleLinePrefix(e.text, e.selection, 'bullet').text).toBe('x\none\n  two\ny');
  });
  it('turns a bullet into a task and a task off', () => {
    expect(toggleLinePrefix('- milk', at(6), 'task').text).toBe('- [ ] milk');
    expect(toggleLinePrefix('- [x] milk', at(3), 'task').text).toBe('milk');
  });
  it('works on an empty document', () => {
    expect(toggleLinePrefix('', at(0), 'task')).toEqual({ text: '- [ ] ', selection: at(6) });
  });
});

describe('insertLink', () => {
  it('uses the selection as the label and selects the url', () => {
    expect(insertLink('see docs', at(4, 8))).toEqual({
      text: 'see [docs](https://)',
      selection: at(11, 19),
    });
  });
  it('uses a selected url as the target and leaves the label to type', () => {
    expect(insertLink('https://x.io', at(0, 12))).toEqual({
      text: '[](https://x.io)',
      selection: at(1),
    });
  });
});

describe('continueList', () => {
  it('carries bullets, tasks and numbers to the new line', () => {
    expect(continueList('- a', '- a\n')).toEqual({ text: '- a\n- ', selection: at(6) });
    expect(continueList('- [x] a', '- [x] a\n')?.text).toBe('- [x] a\n- [ ] ');
    expect(continueList('  9. a\nz', '  9. a\n\nz')).toEqual({
      text: '  9. a\n  10. \nz',
      selection: at(13),
    });
  });
  it('ends the list on an empty item', () => {
    expect(continueList('- a\n- ', '- a\n- \n')).toEqual({ text: '- a\n', selection: at(4) });
  });
  it('ignores plain lines, mid-line breaks and other edits', () => {
    expect(continueList('a', 'a\n')).toBeNull();
    expect(continueList('- ab', '- a\nb')).toBeNull();
    expect(continueList('- a', '- ab')).toBeNull();
  });
});

describe('EditHistory', () => {
  const s = (text: string) => ({ text, selection: at(text.length) });
  it('undoes and redoes, folding quick typing into one step', () => {
    const h = new EditHistory();
    h.record(s(''), 0, true);
    h.record(s('a'), 100, true); // folded
    h.record(s('ab'), 2000, true);
    expect(h.undo(s('abc'))).toEqual(s('ab'));
    expect(h.undo(s('ab'))).toEqual(s(''));
    expect(h.canUndo).toBe(false);
    expect(h.redo(s(''))).toEqual(s('ab'));
    expect(h.canRedo).toBe(true);
  });
  it('a new edit clears redo; formatting never folds', () => {
    const h = new EditHistory();
    h.record(s('a'), 0, true);
    h.record(s('b'), 10, false);
    expect(h.undo(s('c'))).toEqual(s('b'));
    h.record(s('b'), 20, true);
    expect(h.canRedo).toBe(false);
  });
});
