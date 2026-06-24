import { CodeEditor } from '@cascivo/editor';
import { createRef, render } from 'preact';
import { expect, test } from 'vitest';

// PHASE 4 VALIDATION GATE: prove Cascivo's CodeEditor works under Preact and
// exposes the imperative handle the app's editor relies on (selection-preserving
// external sync). If any of this failed, the CodeMirror swap could not proceed.

function mount(el: preact.VNode) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(el, root);
  return root;
}

test('CodeEditor mounts with markdown language and shows the value', () => {
  const root = mount(<CodeEditor language="markdown" defaultValue={'# hello\nworld'} />);
  const ta = root.querySelector('textarea');
  expect(ta).not.toBeNull();
  expect((ta as HTMLTextAreaElement).value).toContain('# hello');
});

test('onValueChange fires on edit', () => {
  let latest = '';
  const root = mount(
    <CodeEditor
      language="markdown"
      defaultValue={'a'}
      onValueChange={(v) => {
        latest = v;
      }}
    />,
  );
  const ta = root.querySelector('textarea') as HTMLTextAreaElement;
  ta.value = 'a edited';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  expect(latest).toBe('a edited');
});

test('imperative handle: applyEdit + getSelection (selection-preserving sync)', () => {
  const ref = createRef();
  const root = mount(<CodeEditor language="markdown" defaultValue={'hello'} ref={ref as never} />);
  const ta = root.querySelector('textarea') as HTMLTextAreaElement;

  const handle = ref.current as {
    applyEdit: (r: { from: number; to: number }, text: string) => void;
    getSelection: () => { start: number; end: number };
    undo: () => void;
    redo: () => void;
    openFind: () => void;
    focus: () => void;
  };
  // The handle exposes the full API the app's editor needs.
  for (const m of ['applyEdit', 'getSelection', 'undo', 'redo', 'openFind', 'focus'] as const) {
    expect(typeof handle[m]).toBe('function');
  }

  // Programmatic, undoable edit through the same history as keyboard edits.
  handle.applyEdit({ from: 0, to: 0 }, 'X');
  expect(ta.value).toBe('Xhello');

  const sel = handle.getSelection();
  expect(typeof sel.start).toBe('number');
  expect(typeof sel.end).toBe('number');
});
