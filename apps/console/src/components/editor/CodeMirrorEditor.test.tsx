import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real editor needs the vite React-to-preact alias; this stand-in keeps its textarea contract.
vi.mock('@cascivo/editor', () => ({
  CodeEditor: ({ readOnly, defaultValue }: { readOnly?: boolean; defaultValue?: string }) => (
    <textarea readOnly={!!readOnly} value={defaultValue} />
  ),
}));
vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  return {
    Logger: class {
      debug() {}
      error() {}
    },
    githubFileStore: {
      activeFile: signal(null),
      openFiles: signal({}),
      updateFileContent: vi.fn(),
    },
  };
});

const { CodeMirrorEditor } = await import('./CodeMirrorEditor');

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.useRealTimers();
});

describe('CodeMirrorEditor readOnly', () => {
  it('makes the textarea read-only and shows no save button', () => {
    act(() => render(<CodeMirrorEditor path="a.yaml" initialContent="a: 1" readOnly />, host));
    expect(host.querySelector('textarea')?.readOnly).toBe(true);
    expect(host.textContent).not.toContain('SAVE CHANGES');
  });

  it('never auto-saves', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    act(() =>
      render(
        <CodeMirrorEditor path="a.yaml" initialContent="a: 1" onSave={onSave} readOnly />,
        host,
      ),
    );
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stays editable by default', () => {
    act(() => render(<CodeMirrorEditor path="a.yaml" initialContent="a: 1" />, host));
    expect(host.querySelector('textarea')?.readOnly).toBe(false);
  });
});
