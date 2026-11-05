import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const editor = vi.hoisted(() => ({ emit: (_value: string) => {} }));
const store = vi.hoisted(() => ({ saveFile: vi.fn(async (_path: string) => {}) }));
vi.mock('@cascivo/editor', () => ({
  CodeEditor: ({
    defaultValue,
    onValueChange,
  }: {
    defaultValue?: string;
    onValueChange?: (value: string) => void;
  }) => {
    editor.emit = (value) => onValueChange?.(value);
    return <textarea value={defaultValue} />;
  },
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
      saveFile: store.saveFile,
      flushPendingWrites: vi.fn(async () => {}),
    },
  };
});

const { CodeMirrorEditor, AUTOSAVE_DEBOUNCE_MS } = await import('./CodeMirrorEditor');

let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  store.saveFile.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<CodeMirrorEditor path="a.md" />, host));
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.useRealTimers();
});

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

describe('CodeMirrorEditor debounced autosave', () => {
  it('saves once, only after the debounce delay', () => {
    act(() => editor.emit('a'));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(store.saveFile).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
    expect(store.saveFile).toHaveBeenCalledWith('a.md');
  });

  it('debounces rapid edits into one save', () => {
    for (const v of ['a', 'ab', 'abc']) {
      act(() => editor.emit(v));
      act(() => {
        vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 500);
      });
    }
    expect(store.saveFile).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately when the page becomes hidden', () => {
    act(() => editor.emit('a'));
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
    setVisibility('visible');
  });

  it('does not flush on visibilitychange to visible', () => {
    act(() => editor.emit('a'));
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.saveFile).not.toHaveBeenCalled();
  });

  it('flushes immediately on pagehide', () => {
    act(() => editor.emit('a'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
  });

  it('flushes unsaved changes on unmount', () => {
    act(() => editor.emit('a'));
    act(() => render(null, host));
    expect(store.saveFile).toHaveBeenCalledTimes(1);
  });
});
